-- Reservation capacity engine + cancel audit (additive only — never deletes rows).

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS suggested_seating text,
  ADD COLUMN IF NOT EXISTS suggested_capacity integer,
  ADD COLUMN IF NOT EXISTS capacity_status text,
  ADD COLUMN IF NOT EXISTS capacity_warnings text,
  ADD COLUMN IF NOT EXISTS staff_override_capacity boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS actual_party_size integer,
  ADD COLUMN IF NOT EXISTS wants_grill text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancellation_note text,
  ADD COLUMN IF NOT EXISTS cancel_email_status text,
  ADD COLUMN IF NOT EXISTS cancel_email_error text,
  ADD COLUMN IF NOT EXISTS confirm_email_status text;

COMMENT ON COLUMN public.reservations.suggested_seating IS
  'Internal seating recommendation labels, e.g. A1 + B2. Never shown to guests.';
COMMENT ON COLUMN public.reservations.capacity_status IS
  'available | limited | full at booking time (staff may override full).';
COMMENT ON COLUMN public.reservations.wants_grill IS
  'yes | no | undecided — dining preference from guest/staff.';
COMMENT ON COLUMN public.reservations.cancellation_reason IS
  'Staff cancel reason code. Customer email uses safe public wording.';

-- Short-lived online holds to prevent double-booking races (2–5 minutes).
CREATE TABLE IF NOT EXISTS public.reservation_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hold_token text NOT NULL UNIQUE,
  date_iso date NOT NULL,
  time_slot text NOT NULL,
  party_size integer NOT NULL CHECK (party_size > 0),
  wants_grill text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reservation_holds_slot_idx
  ON public.reservation_holds (date_iso, time_slot, expires_at);

CREATE INDEX IF NOT EXISTS reservation_holds_expires_idx
  ON public.reservation_holds (expires_at);

ALTER TABLE public.reservation_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reservation_holds_all" ON public.reservation_holds;
CREATE POLICY "reservation_holds_all"
  ON public.reservation_holds
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.reservation_holds;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
