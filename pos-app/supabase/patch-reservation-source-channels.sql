-- Allow phone_call / online booking sources alongside legacy reservation + walk_in.
-- Safe to re-run in Supabase SQL editor.

ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_source_check;
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_source_check
  CHECK (source IN ('reservation', 'walk_in', 'phone_call', 'online'));

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_visit_source_check;
ALTER TABLE public.sales
  ADD CONSTRAINT sales_visit_source_check
  CHECK (visit_source IS NULL OR visit_source IN ('reservation', 'walk_in', 'phone_call', 'online'));
