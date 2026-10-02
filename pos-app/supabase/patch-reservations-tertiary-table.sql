-- Allow a third linked table for large-party assign / check-in (max 3).
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS tertiary_table_id uuid REFERENCES public.tables(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS reservations_tertiary_table_id_idx
  ON public.reservations (tertiary_table_id);
