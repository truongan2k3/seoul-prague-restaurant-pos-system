BEGIN;

ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS dining_duration_minutes integer;
ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_dining_duration_minutes_check;
ALTER TABLE public.reservations ADD CONSTRAINT reservations_dining_duration_minutes_check
  CHECK (dining_duration_minutes IS NULL OR dining_duration_minutes IN (30,60,90,120,150,180,210,240));

CREATE OR REPLACE FUNCTION public.live_table_availability_snapshot(p_business uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required'; END IF;
  SELECT jsonb_build_object(
    'serverNow', now(),
    'settings', (SELECT jsonb_build_object('duration', s.reservation_duration_minutes, 'buffer', s.reservation_buffer_minutes)
      FROM public.settings s WHERE s.business_id = p_business OR s.id = 1
      ORDER BY (s.business_id = p_business) DESC NULLS LAST LIMIT 1),
    'tables', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', t.id, 'label', t.label, 'status', t.status, 'blocked', t.availability_blocked,
      'occupiedAt', coalesce(t.occupied_at,
        (SELECT min(r.checked_in_at) FROM public.reservations r WHERE r.status = 'checked_in'
          AND t.id IN (r.table_id, r.secondary_table_id, r.tertiary_table_id)),
        (SELECT min(oi.created_at) FROM public.order_items oi WHERE oi.table_id = t.id AND oi.is_cancelled IS NOT TRUE))
      )) FROM public.tables t), '[]'::jsonb),
    'reservations', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'partySize', r.party_size, 'actualPartySize', r.actual_party_size,
      'diningDurationMinutes', r.dining_duration_minutes, 'reservedAt', r.reserved_at, 'checkedInAt', r.checked_in_at, 'status', r.status,
      'notes', r.notes, 'wantsGrill', r.wants_grill,
      'tableLabel', t.label, 'secondaryTableLabel', s.label, 'tertiaryTableLabel', u.label))
      FROM public.reservations r LEFT JOIN public.tables t ON t.id = r.table_id
      LEFT JOIN public.tables s ON s.id = r.secondary_table_id LEFT JOIN public.tables u ON u.id = r.tertiary_table_id
      WHERE r.status IN ('pending', 'confirmed', 'late', 'checked_in')
        AND (r.status = 'checked_in' OR (r.reserved_at > now() - interval '6 hours' AND r.reserved_at < now() + interval '3 days'))
      ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.live_table_availability_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.live_table_availability_snapshot(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.single_reservation_table_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE t public.tables; dining interval; buffer interval; starts timestamptz; ends timestamptz; occupied_end timestamptz;
BEGIN
  IF NEW.status NOT IN ('pending', 'confirmed', 'late', 'checked_in') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.table_id IS NOT DISTINCT FROM OLD.table_id
    AND NEW.secondary_table_id IS NOT DISTINCT FROM OLD.secondary_table_id
    AND NEW.tertiary_table_id IS NOT DISTINCT FROM OLD.tertiary_table_id
    AND NEW.reserved_at IS NOT DISTINCT FROM OLD.reserved_at
    AND NEW.party_size IS NOT DISTINCT FROM OLD.party_size
    AND NEW.dining_duration_minutes IS NOT DISTINCT FROM OLD.dining_duration_minutes
    AND OLD.status IN ('pending', 'confirmed', 'late', 'checked_in') THEN RETURN NEW; END IF;
  IF NEW.secondary_table_id IS NOT NULL OR NEW.tertiary_table_id IS NOT NULL THEN
    RAISE EXCEPTION 'Combined tables are no longer supported. Select one table.';
  END IF;
  IF NEW.table_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO t FROM public.tables WHERE id = NEW.table_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Table is unavailable'; END IF;
  IF auth.role() = 'service_role' AND (
    (NEW.status <> 'checked_in' AND current_setting('app.reservation_assignment_override', true) = NEW.id::text)
    OR (NEW.status = 'checked_in' AND current_setting('app.reservation_check_in_override', true) = NEW.id::text)
  ) THEN RETURN NEW; END IF;
  IF t.availability_blocked THEN RAISE EXCEPTION 'Table is unavailable'; END IF;
  SELECT make_interval(mins => reservation_duration_minutes), make_interval(mins => reservation_buffer_minutes)
    INTO dining, buffer FROM public.settings ORDER BY id LIMIT 1;
  dining := coalesce(dining, interval '90 minutes'); buffer := coalesce(buffer, interval '15 minutes');
  starts := CASE WHEN NEW.status = 'checked_in' THEN clock_timestamp() ELSE NEW.reserved_at END;
  ends := starts + coalesce(make_interval(mins => NEW.dining_duration_minutes), dining);
  SELECT max(coalesce(t.occupied_at, r.checked_in_at) + coalesce(make_interval(mins => r.dining_duration_minutes), dining))
    INTO occupied_end FROM public.reservations r WHERE r.status = 'checked_in'
      AND t.id IN (r.table_id, r.secondary_table_id, r.tertiary_table_id);
  occupied_end := coalesce(occupied_end, t.occupied_at + dining);
  IF NEW.status <> 'checked_in' AND t.status <> 'empty' AND ends > now()
     AND (occupied_end IS NULL OR occupied_end <= now() OR occupied_end > starts) THEN
    RAISE EXCEPTION 'Table is occupied during the requested seating period';
  END IF;
  IF EXISTS (SELECT 1 FROM public.reservations r WHERE r.id <> NEW.id
    AND r.status IN ('pending', 'confirmed', 'late', 'checked_in')
    AND NEW.table_id IN (r.table_id, r.secondary_table_id, r.tertiary_table_id)
    AND ((r.status = 'checked_in' AND (coalesce(t.occupied_at, r.checked_in_at) IS NULL
        OR coalesce(t.occupied_at, r.checked_in_at) + coalesce(make_interval(mins => r.dining_duration_minutes), dining) <= now()
        OR coalesce(t.occupied_at, r.checked_in_at) + coalesce(make_interval(mins => r.dining_duration_minutes), dining) > starts))
      OR (r.status <> 'checked_in' AND r.reserved_at - buffer < ends AND r.reserved_at + coalesce(make_interval(mins => r.dining_duration_minutes), dining) > starts))) THEN
    RAISE EXCEPTION 'Table is already reserved for this seating period';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_in_single_reservation(
  p_reservation uuid, p_table uuid, p_party integer, p_duration integer, p_buffer integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.reservations; t public.tables; seated timestamptz := clock_timestamp(); minutes integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required'; END IF;
  SELECT * INTO r FROM public.reservations WHERE id = p_reservation FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found'; END IF;
  IF r.status = 'checked_in' AND r.table_id = p_table THEN RETURN r.id; END IF;
  IF r.status NOT IN ('pending', 'confirmed', 'late') THEN RAISE EXCEPTION 'Reservation cannot be checked in'; END IF;
  SELECT * INTO t FROM public.tables WHERE id = p_table FOR UPDATE;
  IF NOT FOUND OR t.status <> 'empty' OR t.availability_blocked THEN RAISE EXCEPTION 'Table is occupied or unavailable'; END IF;
  minutes := coalesce(r.dining_duration_minutes, p_duration);
  IF p_party IS NULL OR p_party < 1 OR minutes IS NULL OR minutes NOT BETWEEN 30 AND 240 OR p_buffer IS NULL OR p_buffer NOT BETWEEN 0 AND 120 THEN RAISE EXCEPTION 'Invalid seating details'; END IF;
  IF EXISTS (SELECT 1 FROM public.reservations b WHERE b.id <> r.id
    AND b.status IN ('pending', 'confirmed', 'late', 'checked_in') AND p_table IN (b.table_id, b.secondary_table_id, b.tertiary_table_id)
    AND (b.status = 'checked_in' OR (b.reserved_at - make_interval(mins => p_buffer) < seated + make_interval(mins => minutes)
      AND b.reserved_at + make_interval(mins => coalesce(b.dining_duration_minutes, p_duration)) > seated))) THEN RAISE EXCEPTION 'Table is reserved for another seating'; END IF;
  UPDATE public.tables SET status = 'waiting', occupied_at = seated, orders = '[]'::jsonb,
    payment_status = 'unpaid', fulfillment_status = 'in_progress' WHERE id = p_table;
  UPDATE public.reservations SET status = 'checked_in', table_id = p_table, secondary_table_id = NULL,
    tertiary_table_id = NULL, actual_party_size = p_party, checked_in_at = seated, updated_at = seated WHERE id = r.id;
  RETURN r.id;
END;
$$;
REVOKE ALL ON FUNCTION public.check_in_single_reservation(uuid, uuid, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_single_reservation(uuid, uuid, integer, integer, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
