-- Late SLA: mark reservation as late 30 minutes after reserved_at if guest has not checked in.
-- Applies to pending + confirmed bookings.

ALTER TABLE public.settings
  ALTER COLUMN reservation_table_holding_time SET DEFAULT 30;

UPDATE public.settings
SET reservation_table_holding_time = 30
WHERE id = 1
  AND (
    reservation_table_holding_time IS NULL
    OR reservation_table_holding_time = 90
  );
