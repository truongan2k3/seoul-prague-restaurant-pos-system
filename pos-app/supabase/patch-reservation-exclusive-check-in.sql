BEGIN;

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

COMMIT;
