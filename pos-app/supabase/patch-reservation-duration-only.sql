BEGIN;

-- Keep the legacy column for existing functions and devices; it always means zero.
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS reservation_buffer_minutes integer NOT NULL DEFAULT 0;
ALTER TABLE public.settings ALTER COLUMN reservation_buffer_minutes SET DEFAULT 0;

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

UPDATE public.settings SET reservation_buffer_minutes = 0 WHERE reservation_buffer_minutes IS DISTINCT FROM 0;

NOTIFY pgrst, 'reload schema';
COMMIT;
