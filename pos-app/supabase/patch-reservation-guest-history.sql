BEGIN;

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS guest_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS seated_table_labels text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.reservation_guest_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  changes jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'object'),
  event_kind text NOT NULL DEFAULT 'guest_updated'
);
ALTER TABLE public.reservation_guest_changes ADD COLUMN IF NOT EXISTS event_kind text NOT NULL DEFAULT 'guest_updated';
CREATE INDEX IF NOT EXISTS reservation_guest_changes_visit_idx
  ON public.reservation_guest_changes (reservation_id, changed_at DESC, id DESC);
ALTER TABLE public.reservation_guest_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reservation_guest_changes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.reservation_guest_changes TO service_role;

-- Recover known seating for older visits from retained links and original payments.
UPDATE public.reservations r SET seated_table_labels = ARRAY(
  SELECT label FROM (
    SELECT unnest(r.seated_table_labels) AS label
    UNION SELECT t.label FROM public.tables t WHERE t.id IN (r.table_id,r.secondary_table_id,r.tertiary_table_id)
    UNION SELECT s.table_label FROM public.sales s WHERE s.reservation_id = r.id
  ) known WHERE nullif(btrim(label), '') IS NOT NULL ORDER BY label
) WHERE cardinality(r.seated_table_labels) = 0 AND (r.checked_in_at IS NOT NULL OR r.status IN ('checked_in','completed'));

CREATE OR REPLACE FUNCTION public.preserve_reservation_seating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE ids uuid[] := '{}'; labels text[] := '{}';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    labels := coalesce(OLD.seated_table_labels, '{}');
    IF OLD.status = 'checked_in' THEN ids := array_remove(ARRAY[OLD.table_id,OLD.secondary_table_id,OLD.tertiary_table_id],NULL); END IF;
  END IF;
  IF NEW.status = 'checked_in' THEN ids := ids || array_remove(ARRAY[NEW.table_id,NEW.secondary_table_id,NEW.tertiary_table_id],NULL); END IF;
  NEW.seated_table_labels := ARRAY(SELECT DISTINCT label FROM (
    SELECT unnest(labels || coalesce(NEW.seated_table_labels,'{}')) AS label
    UNION SELECT t.label FROM public.tables t WHERE t.id = ANY(ids)
  ) known WHERE nullif(btrim(label),'') IS NOT NULL ORDER BY label);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.preserve_reservation_seating() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS preserve_reservation_seating ON public.reservations;
CREATE TRIGGER preserve_reservation_seating BEFORE INSERT OR UPDATE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.preserve_reservation_seating();

CREATE OR REPLACE FUNCTION public.capture_reservation_guest_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE previous jsonb := '{}'; current_values jsonb := to_jsonb(NEW); delta jsonb; kind text; guest_edit boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    previous := to_jsonb(OLD);
    guest_edit := NEW.guest_changed_at IS NOT NULL AND NEW.guest_changed_at IS DISTINCT FROM OLD.guest_changed_at;
    previous := previous || jsonb_build_object('table_labels', (SELECT jsonb_agg(t.label ORDER BY selected.position)
      FROM unnest(ARRAY[OLD.table_id,OLD.secondary_table_id,OLD.tertiary_table_id]) WITH ORDINALITY selected(id,position)
      JOIN public.tables t ON t.id = selected.id));
  END IF;
  current_values := current_values || jsonb_build_object('table_labels', (SELECT jsonb_agg(t.label ORDER BY selected.position)
    FROM unnest(ARRAY[NEW.table_id,NEW.secondary_table_id,NEW.tertiary_table_id]) WITH ORDINALITY selected(id,position)
    JOIN public.tables t ON t.id = selected.id));
  SELECT jsonb_object_agg(field, jsonb_build_object('before', previous->field, 'after', current_values->field)) INTO delta
  FROM unnest(ARRAY['guest_name','guest_phone','guest_email','party_size','actual_party_size','reserved_at',
    'notes','event_type','wants_grill','referral_code','status','table_labels']) AS fields(field)
  WHERE coalesce(previous->field,'null'::jsonb) IS DISTINCT FROM coalesce(current_values->field,'null'::jsonb);
  IF delta IS NULL THEN RETURN NEW; END IF;
  kind := CASE
    WHEN TG_OP = 'INSERT' THEN 'created'
    WHEN guest_edit AND NEW.status = 'cancelled' THEN 'guest_cancelled'
    WHEN guest_edit THEN 'guest_updated'
    WHEN NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'checked_in' THEN 'checked_in'
    WHEN NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'completed' THEN 'completed'
    WHEN NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'cancelled' THEN 'cancelled'
    WHEN delta ? 'table_labels' THEN CASE WHEN NEW.status = 'checked_in' THEN 'tables_changed' ELSE 'assigned' END
    WHEN delta ? 'status' THEN 'status_changed'
    ELSE 'staff_updated' END;
  INSERT INTO public.reservation_guest_changes(reservation_id, changed_at, changes, event_kind)
    VALUES (NEW.id, clock_timestamp(), delta, kind);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_reservation_guest_changes() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS capture_reservation_guest_changes ON public.reservations;
CREATE TRIGGER capture_reservation_guest_changes AFTER INSERT OR UPDATE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.capture_reservation_guest_changes();

NOTIFY pgrst, 'reload schema';
COMMIT;
