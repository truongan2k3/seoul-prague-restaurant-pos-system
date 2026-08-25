-- Floor map vertical reservation ticker interval (seconds)
-- Run in Supabase SQL editor

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS map_reservation_ticker_seconds int DEFAULT 6;

NOTIFY pgrst, 'reload schema';
