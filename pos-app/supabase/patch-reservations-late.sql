-- Add 'late' status for reservation SLA (30-minute grace period)
-- Run in Supabase SQL editor after patch-reservations.sql
-- Safe to re-run.

ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
ALTER TABLE public.reservations ADD CONSTRAINT reservations_status_check
  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'no_show', 'checked_in', 'completed', 'late'));
