BEGIN;

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS staff_override_capacity boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS capacity_warnings text;

CREATE OR REPLACE FUNCTION public.single_reservation_table_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE t public.tables; ids uuid[]; dining interval; buffer interval; starts timestamptz; ends timestamptz;
BEGIN
  IF NEW.status NOT IN ('pending','confirmed','late','checked_in') THEN RETURN NEW; END IF;
  ids := array_remove(ARRAY[NEW.table_id,NEW.secondary_table_id,NEW.tertiary_table_id],NULL);
  IF cardinality(ids)=0 THEN RETURN NEW; END IF;
  IF cardinality(ids)<>(SELECT count(DISTINCT id) FROM unnest(ids) id) THEN RAISE EXCEPTION 'Select distinct tables'; END IF;
  IF TG_OP='UPDATE' AND OLD.status IN ('pending','confirmed','late','checked_in') AND (NEW.status=OLD.status OR NEW.status<>'checked_in') AND NEW.reserved_at IS NOT DISTINCT FROM OLD.reserved_at
    AND NEW.party_size IS NOT DISTINCT FROM OLD.party_size AND (
      (NEW.table_id IS NOT DISTINCT FROM OLD.table_id AND NEW.secondary_table_id IS NOT DISTINCT FROM OLD.secondary_table_id AND NEW.tertiary_table_id IS NOT DISTINCT FROM OLD.tertiary_table_id)
      OR (OLD.status='checked_in' AND ids <@ array_remove(ARRAY[OLD.table_id,OLD.secondary_table_id,OLD.tertiary_table_id],NULL))) THEN RETURN NEW; END IF;
  PERFORM 1 FROM public.tables WHERE id=ANY(ids) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.tables WHERE id=ANY(ids))<>cardinality(ids) THEN RAISE EXCEPTION 'Table not found'; END IF;
  IF NEW.status='checked_in' AND EXISTS(SELECT 1 FROM public.reservations r WHERE r.id<>NEW.id AND r.status='checked_in'
    AND ids && ARRAY[r.table_id,r.secondary_table_id,r.tertiary_table_id]) THEN
    RAISE EXCEPTION 'Table already has a checked-in reservation. Complete the current visit first.';
  END IF;
  IF auth.role()='service_role' AND (
    (NEW.status<>'checked_in' AND current_setting('app.reservation_assignment_override',true)=NEW.id::text)
    OR (NEW.status='checked_in' AND current_setting('app.reservation_check_in_override',true)=NEW.id::text)) THEN RETURN NEW; END IF;
  SELECT make_interval(mins=>reservation_duration_minutes),make_interval(mins=>reservation_buffer_minutes)
    INTO dining,buffer FROM public.settings ORDER BY id LIMIT 1;
  dining:=coalesce(dining,interval '90 minutes'); buffer:=coalesce(buffer,interval '15 minutes');
  starts:=CASE WHEN NEW.status='checked_in' THEN clock_timestamp() ELSE NEW.reserved_at END; ends:=starts+dining;
  FOR t IN SELECT * FROM public.tables WHERE id=ANY(ids) ORDER BY id LOOP
    IF t.availability_blocked THEN RAISE EXCEPTION 'Table is unavailable'; END IF;
    IF NEW.status<>'checked_in' AND t.status<>'empty' AND ends>now()
      AND (t.occupied_at IS NULL OR t.occupied_at+dining<=now() OR t.occupied_at+dining+buffer>starts) THEN
      RAISE EXCEPTION 'Table is occupied during the requested seating period';
    END IF;
    IF EXISTS(SELECT 1 FROM public.reservations r WHERE r.id<>NEW.id
      AND r.status IN ('pending','confirmed','late','checked_in') AND t.id IN(r.table_id,r.secondary_table_id,r.tertiary_table_id)
      AND ((r.status='checked_in' AND (r.checked_in_at IS NULL OR r.checked_in_at+dining<=now() OR r.checked_in_at+dining+buffer>starts))
        OR (r.status<>'checked_in' AND r.reserved_at-buffer<ends AND r.reserved_at+dining+buffer>starts))) THEN
      RAISE EXCEPTION 'Table is already reserved for this seating period';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS single_reservation_table_guard ON public.reservations;
CREATE TRIGGER single_reservation_table_guard BEFORE INSERT OR UPDATE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.single_reservation_table_guard();

CREATE OR REPLACE FUNCTION public.override_reservation_table_assignment(
  p_reservation uuid, p_table uuid, p_staff uuid, p_business uuid, p_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.reservations; previous_scope text; assigned_at timestamptz := clock_timestamp();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = p_staff AND business_id = p_business
    AND active AND role IN ('admin', 'manager', 'cashier', 'server')) THEN RAISE EXCEPTION 'Unauthorized staff'; END IF;
  IF nullif(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Assignment override reason is required'; END IF;
  SELECT * INTO r FROM public.reservations WHERE id = p_reservation FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found'; END IF;
  IF r.status NOT IN ('pending', 'confirmed', 'late') THEN
    RAISE EXCEPTION 'Only reservations waiting to check in can be assigned';
  END IF;
  previous_scope := current_setting('app.reservation_assignment_override', true);
  PERFORM set_config('app.reservation_assignment_override', p_reservation::text, true);
  UPDATE public.reservations SET table_id = p_table, secondary_table_id = NULL, tertiary_table_id = NULL,
    staff_override_capacity = true,
    capacity_warnings = concat_ws(E'\n', nullif(r.capacity_warnings, ''),
      format('[%s] Assignment override by staff %s (business %s), table %s -> %s: %s',
        assigned_at, p_staff, p_business, r.table_id, p_table, left(p_reason, 2000))),
    updated_at = assigned_at WHERE id = p_reservation;
  PERFORM set_config('app.reservation_assignment_override', coalesce(previous_scope, ''), true);
  RETURN p_reservation;
END;
$$;
REVOKE ALL ON FUNCTION public.override_reservation_table_assignment(uuid, uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.override_reservation_table_assignment(uuid, uuid, uuid, uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.override_reservation_check_in(
  p_reservation uuid, p_table uuid, p_party integer, p_staff uuid, p_business uuid, p_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.reservations; t public.tables; previous_scope text; seated timestamptz := clock_timestamp();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required'; END IF;
  IF p_business IS NULL OR NOT EXISTS (SELECT 1 FROM public.businesses WHERE id = p_business) THEN
    RAISE EXCEPTION 'Business session required';
  END IF;
  -- Staff identity is optional audit metadata. Any reception device signed into
  -- the business may confirm check-in, regardless of staff login or role.
  IF p_staff IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.staff
    WHERE id = p_staff AND business_id = p_business AND active) THEN p_staff := NULL; END IF;
  IF p_party IS NULL OR p_party < 1 OR nullif(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Valid guest count and override reason are required'; END IF;
  SELECT * INTO r FROM public.reservations WHERE id = p_reservation FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found'; END IF;
  IF r.status = 'checked_in' AND r.table_id = p_table THEN RETURN r.id; END IF;
  IF r.status NOT IN ('pending', 'confirmed', 'late') THEN RAISE EXCEPTION 'Reservation cannot be checked in'; END IF;
  SELECT * INTO t FROM public.tables WHERE id = p_table FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Table not found'; END IF;
  IF t.status <> 'empty' THEN RAISE EXCEPTION 'Table is occupied. Complete the current visit before checking in another party.'; END IF;
  IF EXISTS (SELECT 1 FROM public.reservations b WHERE b.id <> r.id AND b.status = 'checked_in'
    AND p_table IN (b.table_id, b.secondary_table_id, b.tertiary_table_id)) THEN
    RAISE EXCEPTION 'Table already has a checked-in reservation. Complete the current visit first.';
  END IF;
  previous_scope := current_setting('app.reservation_check_in_override', true);
  PERFORM set_config('app.reservation_check_in_override', p_reservation::text, true);
  UPDATE public.tables SET status = 'waiting', occupied_at = seated,
    payment_status = 'unpaid', fulfillment_status = 'in_progress' WHERE id = p_table;
  UPDATE public.reservations SET status = 'checked_in', table_id = p_table, secondary_table_id = NULL,
    tertiary_table_id = NULL, actual_party_size = p_party, checked_in_at = seated,
    staff_override_capacity = true,
    capacity_warnings = concat_ws(E'\n', nullif(r.capacity_warnings, ''),
      format('[%s] Check-in override by %s (business %s), table %s (prior status %s): %s',
        seated, coalesce(p_staff::text, 'reception device (no staff login)'), p_business, p_table, t.status, left(p_reason, 2000))),
    updated_at = seated WHERE id = p_reservation;
  PERFORM set_config('app.reservation_check_in_override', coalesce(previous_scope, ''), true);
  RETURN p_reservation;
END;
$$;
REVOKE ALL ON FUNCTION public.override_reservation_check_in(uuid, uuid, integer, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.override_reservation_check_in(uuid, uuid, integer, uuid, uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.override_reservation_table_assignments(
  p_reservation uuid, p_tables uuid[], p_staff uuid, p_business uuid, p_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.reservations; previous_scope text; assigned_at timestamptz := clock_timestamp();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = p_staff AND business_id = p_business
    AND active AND role IN ('admin', 'manager', 'cashier', 'server')) THEN RAISE EXCEPTION 'Unauthorized staff'; END IF;
  IF p_tables IS NULL OR cardinality(p_tables) NOT BETWEEN 1 AND 3
    OR array_ndims(p_tables) IS DISTINCT FROM 1 OR array_lower(p_tables, 1) IS DISTINCT FROM 1
    OR array_position(p_tables, NULL) IS NOT NULL
    OR cardinality(p_tables) <> (SELECT count(DISTINCT id) FROM unnest(p_tables) AS ids(id)) THEN
    RAISE EXCEPTION 'Select one to three distinct tables';
  END IF;
  IF nullif(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Assignment override reason is required'; END IF;
  SELECT * INTO r FROM public.reservations WHERE id = p_reservation FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found'; END IF;
  IF r.status NOT IN ('pending', 'confirmed', 'late') THEN
    RAISE EXCEPTION 'Only reservations waiting to check in can be assigned';
  END IF;
  PERFORM 1 FROM public.tables WHERE id = ANY(p_tables) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.tables WHERE id = ANY(p_tables)) <> cardinality(p_tables) THEN
    RAISE EXCEPTION 'Table not found';
  END IF;
  previous_scope := current_setting('app.reservation_assignment_override', true);
  PERFORM set_config('app.reservation_assignment_override', p_reservation::text, true);
  UPDATE public.reservations SET table_id = p_tables[1], secondary_table_id = p_tables[2], tertiary_table_id = p_tables[3],
    staff_override_capacity = true,
    capacity_warnings = concat_ws(E'\n', nullif(r.capacity_warnings, ''),
      format('[%s] Assignment override by staff %s (business %s), tables %s -> %s: %s',
        assigned_at, p_staff, p_business, ARRAY[r.table_id,r.secondary_table_id,r.tertiary_table_id], p_tables, left(p_reason, 2000))),
    updated_at = assigned_at WHERE id = p_reservation;
  PERFORM set_config('app.reservation_assignment_override', coalesce(previous_scope, ''), true);
  RETURN p_reservation;
END;
$$;
REVOKE ALL ON FUNCTION public.override_reservation_table_assignments(uuid, uuid[], uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.override_reservation_table_assignments(uuid, uuid[], uuid, uuid, text)
  TO service_role;

COMMIT;
