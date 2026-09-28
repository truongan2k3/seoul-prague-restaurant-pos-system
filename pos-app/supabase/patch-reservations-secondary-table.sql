-- Allow a reservation to plan / check in at up to 2 tables (large parties).
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS secondary_table_id uuid REFERENCES public.tables(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS reservations_secondary_table_id_idx
  ON public.reservations (secondary_table_id);

NOTIFY pgrst, 'reload schema';
