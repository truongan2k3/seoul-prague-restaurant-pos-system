-- Reservation / sale visit sources: phone_call + online (no new walk_in).
-- Safe to re-run in Supabase SQL editor.
--
-- 1) Migrate legacy walk_in rows → online
-- 2) Widen CHECKs for phone_call / online
-- 3) Drop walk_in from allowed values

UPDATE public.reservations
SET source = 'online'
WHERE source = 'walk_in';

UPDATE public.sales
SET visit_source = 'online'
WHERE visit_source = 'walk_in';

ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_source_check;
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_source_check
  CHECK (source IN ('reservation', 'phone_call', 'online'));

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_visit_source_check;
ALTER TABLE public.sales
  ADD CONSTRAINT sales_visit_source_check
  CHECK (visit_source IS NULL OR visit_source IN ('reservation', 'phone_call', 'online'));
