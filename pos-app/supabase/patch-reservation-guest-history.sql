BEGIN;

ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS guest_changed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.reservation_guest_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  changes jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'object')
);
CREATE INDEX IF NOT EXISTS reservation_guest_changes_visit_idx
  ON public.reservation_guest_changes (reservation_id, changed_at DESC, id DESC);
ALTER TABLE public.reservation_guest_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reservation_guest_changes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.reservation_guest_changes TO service_role;

CREATE OR REPLACE FUNCTION public.capture_reservation_guest_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE previous jsonb := to_jsonb(OLD); current_values jsonb := to_jsonb(NEW); delta jsonb;
BEGIN
  IF NEW.guest_changed_at IS NULL OR NEW.guest_changed_at IS NOT DISTINCT FROM OLD.guest_changed_at THEN RETURN NEW; END IF;
  SELECT jsonb_object_agg(field, jsonb_build_object('before', previous->field, 'after', current_values->field)) INTO delta
  FROM unnest(ARRAY['guest_name','guest_phone','guest_email','party_size','reserved_at',
    'notes','event_type','wants_grill','referral_code','status']) AS fields(field)
  WHERE previous->field IS DISTINCT FROM current_values->field;
  IF delta IS NOT NULL THEN
    INSERT INTO public.reservation_guest_changes(reservation_id, changed_at, changes)
      VALUES (NEW.id, clock_timestamp(), delta);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_reservation_guest_changes() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS capture_reservation_guest_changes ON public.reservations;
CREATE TRIGGER capture_reservation_guest_changes AFTER UPDATE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.capture_reservation_guest_changes();

NOTIFY pgrst, 'reload schema';
COMMIT;
