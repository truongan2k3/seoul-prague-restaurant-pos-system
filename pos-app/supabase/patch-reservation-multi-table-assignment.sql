BEGIN;

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
