-- Dining overlap window for capacity engine (default 90 minutes).
-- Guest action timestamps for Main POS staff visibility.

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS reservation_duration_minutes integer NOT NULL DEFAULT 90;

UPDATE public.settings
SET reservation_duration_minutes = 90
WHERE reservation_duration_minutes IS NULL
   OR reservation_duration_minutes < 60
   OR reservation_duration_minutes > 240;

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS guest_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS guest_changed_at timestamptz;

COMMENT ON COLUMN public.settings.reservation_duration_minutes IS
  'Assumed dining window (minutes) for reservation capacity overlap / table blocking.';

COMMENT ON COLUMN public.reservations.guest_submitted_at IS
  'When the guest (or reception desk form) first submitted this booking.';

COMMENT ON COLUMN public.reservations.guest_changed_at IS
  'When the guest last changed this booking via manage link.';
