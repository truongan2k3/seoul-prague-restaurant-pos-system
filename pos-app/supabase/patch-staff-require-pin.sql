-- Per-staff PIN gate for void / price edit / delete (default off).
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS require_pin_for_actions boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.staff.require_pin_for_actions IS
  'When true, this staff member must enter a manager PIN before void, price edit, etc.';
