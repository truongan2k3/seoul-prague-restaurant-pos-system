-- Guest self-serve reservation manage + email codes
-- Run in Supabase SQL editor after patch-reservations.sql

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS booking_code text,
  ADD COLUMN IF NOT EXISTS manage_token text;

CREATE UNIQUE INDEX IF NOT EXISTS reservations_booking_code_uidx
  ON public.reservations (booking_code)
  WHERE booking_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS reservations_manage_token_uidx
  ON public.reservations (manage_token)
  WHERE manage_token IS NOT NULL;
