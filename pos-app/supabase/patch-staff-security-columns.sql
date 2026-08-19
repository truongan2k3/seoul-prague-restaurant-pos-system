-- Staff security columns used by POS profile / staff management.
-- Safe to run multiple times. Run in Supabase → SQL → New query.

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS require_pin_for_actions boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.staff.require_pin_for_actions IS
  'When true, this staff member must enter a manager PIN before void, price edit, etc.';

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS require_switch_password boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.staff.require_switch_password IS
  'When true, staff must enter this member''s PIN before switching to their POS profile.';

-- Optional: refresh PostgREST schema cache (Supabase usually picks this up within ~1 min)
NOTIFY pgrst, 'reload schema';
