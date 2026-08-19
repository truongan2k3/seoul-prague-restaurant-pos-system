-- Require staff PIN when switching POS profile from the sidebar.
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS require_switch_password boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.staff.require_switch_password IS
  'When true, staff must enter this member''s PIN before switching to their POS profile.';
