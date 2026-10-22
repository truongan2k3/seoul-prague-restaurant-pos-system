ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS reservation_capacity_limits_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.reservation_booking_limits_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.reservation_capacity_limits_enabled = false)
     OR (TG_OP = 'UPDATE' AND NEW.reservation_capacity_limits_enabled IS DISTINCT FROM OLD.reservation_capacity_limits_enabled) THEN
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND current_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'Staff authorization required';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reservation_booking_limits_guard ON public.settings;
CREATE TRIGGER reservation_booking_limits_guard BEFORE INSERT OR UPDATE ON public.settings
FOR EACH ROW EXECUTE FUNCTION public.reservation_booking_limits_guard();
