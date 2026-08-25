-- Reservation prep reminder: 15 / 30 / both
-- Run in Supabase SQL editor

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS reservation_reminder_mode text DEFAULT '30';

UPDATE public.settings
SET reservation_reminder_mode = '30'
WHERE reservation_reminder_mode IS NULL
   OR reservation_reminder_mode NOT IN ('15', '30', 'both');

ALTER TABLE public.settings
  DROP CONSTRAINT IF EXISTS settings_reservation_reminder_mode_check;

ALTER TABLE public.settings
  ADD CONSTRAINT settings_reservation_reminder_mode_check
  CHECK (reservation_reminder_mode IN ('15', '30', 'both'));

NOTIFY pgrst, 'reload schema';
