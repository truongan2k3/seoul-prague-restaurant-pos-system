BEGIN;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS reservation_duration_minutes integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS reservation_buffer_minutes integer NOT NULL DEFAULT 0;
ALTER TABLE public.tables
  ADD COLUMN IF NOT EXISTS availability_blocked boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.live_table_occupancy_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.availability_blocked IS DISTINCT FROM OLD.availability_blocked
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Staff authorization required';
  END IF;
  IF NEW.status = 'empty' THEN
    NEW.occupied_at := NULL;
  ELSIF OLD.status = 'empty' THEN
    -- New seating sends NULL; transfers and undo retain their recorded visit time.
    IF NEW.occupied_at IS NULL THEN
      NEW.occupied_at := clock_timestamp();
    END IF;
  ELSIF NEW.occupied_at IS NULL THEN
    NEW.occupied_at := OLD.occupied_at;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS live_table_occupancy_guard ON public.tables;
CREATE TRIGGER live_table_occupancy_guard BEFORE UPDATE ON public.tables
FOR EACH ROW EXECUTE FUNCTION public.live_table_occupancy_guard();

CREATE OR REPLACE FUNCTION public.live_reservation_settings_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.reservation_buffer_minutes := 0;
  IF (TG_OP = 'INSERT' AND NEW.reservation_duration_minutes <> 90)
    OR (TG_OP = 'UPDATE' AND NEW.reservation_duration_minutes IS DISTINCT FROM OLD.reservation_duration_minutes) THEN
    IF auth.role() IS DISTINCT FROM 'service_role'
      AND current_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'Staff authorization required';
    END IF;
  END IF;
  IF NEW.reservation_duration_minutes IS NULL OR NEW.reservation_duration_minutes NOT BETWEEN 60 AND 240 THEN
    RAISE EXCEPTION 'Dining duration must be between 60 and 240 minutes';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS live_reservation_settings_guard ON public.settings;
CREATE TRIGGER live_reservation_settings_guard BEFORE INSERT OR UPDATE ON public.settings
FOR EACH ROW EXECUTE FUNCTION public.live_reservation_settings_guard();

ALTER TABLE public.settings ALTER COLUMN reservation_buffer_minutes SET DEFAULT 0;
UPDATE public.settings SET reservation_buffer_minutes = 0 WHERE reservation_buffer_minutes IS DISTINCT FROM 0;

-- One consistent database snapshot; no customer contacts leave this RPC.
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
      'reservedAt', r.reserved_at, 'checkedInAt', r.checked_in_at, 'status', r.status,
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

-- Serialize allocations on the physical table, including concurrent staff actions.
CREATE OR REPLACE FUNCTION public.single_reservation_table_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE t public.tables; dining interval; buffer interval; starts timestamptz; ends timestamptz;
BEGIN
  IF NEW.status NOT IN ('pending', 'confirmed', 'late', 'checked_in') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.table_id IS NOT DISTINCT FROM OLD.table_id
    AND NEW.secondary_table_id IS NOT DISTINCT FROM OLD.secondary_table_id
    AND NEW.tertiary_table_id IS NOT DISTINCT FROM OLD.tertiary_table_id
    AND NEW.reserved_at IS NOT DISTINCT FROM OLD.reserved_at
    AND NEW.party_size IS NOT DISTINCT FROM OLD.party_size
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
  ends := starts + dining;
  IF NEW.status <> 'checked_in' AND t.status <> 'empty' AND ends > now()
     AND (t.occupied_at IS NULL OR t.occupied_at + dining <= now() OR t.occupied_at + dining + buffer > starts) THEN
    RAISE EXCEPTION 'Table is occupied during the requested seating period';
  END IF;
  IF EXISTS (SELECT 1 FROM public.reservations r WHERE r.id <> NEW.id
    AND r.status IN ('pending', 'confirmed', 'late', 'checked_in')
    AND NEW.table_id IN (r.table_id, r.secondary_table_id, r.tertiary_table_id)
    AND ((r.status = 'checked_in' AND (r.checked_in_at IS NULL OR r.checked_in_at + dining <= now() OR r.checked_in_at + dining + buffer > starts))
      OR (r.status <> 'checked_in' AND r.reserved_at - buffer < ends AND r.reserved_at + dining + buffer > starts))) THEN
    RAISE EXCEPTION 'Table is already reserved for this seating period';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS single_reservation_table_guard ON public.reservations;
CREATE TRIGGER single_reservation_table_guard BEFORE INSERT OR UPDATE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.single_reservation_table_guard();

CREATE OR REPLACE FUNCTION public.check_in_single_reservation(
  p_reservation uuid, p_table uuid, p_party integer, p_duration integer, p_buffer integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.reservations; t public.tables; seated timestamptz := clock_timestamp();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required'; END IF;
  SELECT * INTO r FROM public.reservations WHERE id = p_reservation FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found'; END IF;
  IF r.status = 'checked_in' AND r.table_id = p_table THEN RETURN r.id; END IF;
  IF r.status NOT IN ('pending', 'confirmed', 'late') THEN RAISE EXCEPTION 'Reservation cannot be checked in'; END IF;
  SELECT * INTO t FROM public.tables WHERE id = p_table FOR UPDATE;
  IF NOT FOUND OR t.status <> 'empty' OR t.availability_blocked THEN RAISE EXCEPTION 'Table is occupied or unavailable'; END IF;
  IF p_party < 1 OR p_duration NOT BETWEEN 60 AND 240 OR p_buffer NOT BETWEEN 0 AND 120 THEN RAISE EXCEPTION 'Invalid seating details'; END IF;
  IF EXISTS (SELECT 1 FROM public.reservations b WHERE b.id <> r.id
    AND b.status IN ('pending', 'confirmed', 'late', 'checked_in') AND p_table IN (b.table_id, b.secondary_table_id, b.tertiary_table_id)
    AND (b.status = 'checked_in' OR (b.reserved_at - make_interval(mins => p_buffer) < seated + make_interval(mins => p_duration)
      AND b.reserved_at + make_interval(mins => p_duration + p_buffer) > seated))) THEN RAISE EXCEPTION 'Table is reserved for another seating'; END IF;
  UPDATE public.tables SET status = 'waiting', occupied_at = seated, orders = '[]'::jsonb,
    payment_status = 'unpaid', fulfillment_status = 'in_progress' WHERE id = p_table;
  UPDATE public.reservations SET status = 'checked_in', table_id = p_table, secondary_table_id = NULL,
    tertiary_table_id = NULL, actual_party_size = p_party, checked_in_at = seated, updated_at = seated WHERE id = r.id;
  RETURN r.id;
END;
$$;
REVOKE ALL ON FUNCTION public.check_in_single_reservation(uuid, uuid, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_single_reservation(uuid, uuid, integer, integer, integer) TO service_role;

COMMIT;
