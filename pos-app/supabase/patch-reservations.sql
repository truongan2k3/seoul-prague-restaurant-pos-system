-- Reservations + guest info on sales
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS public.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid REFERENCES public.tables(id) ON DELETE SET NULL,
  guest_name text NOT NULL,
  guest_phone text,
  guest_email text,
  party_size int NOT NULL CHECK (party_size > 0),
  reserved_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'no_show', 'checked_in', 'completed')),
  source text NOT NULL DEFAULT 'reservation'
    CHECK (source IN ('reservation', 'walk_in')),
  notes text,
  staff_id uuid REFERENCES public.staff(id),
  staff_name text,
  checked_in_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reservations_reserved_at_idx ON public.reservations (reserved_at);
CREATE INDEX IF NOT EXISTS reservations_status_idx ON public.reservations (status);
CREATE INDEX IF NOT EXISTS reservations_table_id_idx ON public.reservations (table_id);

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS guest_name text,
  ADD COLUMN IF NOT EXISTS guest_phone text,
  ADD COLUMN IF NOT EXISTS party_size int,
  ADD COLUMN IF NOT EXISTS visit_source text CHECK (visit_source IN ('reservation', 'walk_in'));

ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reservations_anon_all" ON public.reservations;
CREATE POLICY "reservations_anon_all" ON public.reservations FOR ALL USING (true) WITH CHECK (true);

-- Safe to re-run: skips if reservations is already in the Realtime publication
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;
