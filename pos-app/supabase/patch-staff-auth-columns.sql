-- Staff login credentials (per employee, scoped to business).
-- Safe to run multiple times. Run in Supabase → SQL → New query.

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS password_salt text,
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.staff.username IS 'Login username for this staff member (unique per business).';
COMMENT ON COLUMN public.staff.password_hash IS 'scrypt hash of staff login password.';
COMMENT ON COLUMN public.staff.password_salt IS 'Salt for staff login password hash.';
COMMENT ON COLUMN public.staff.business_id IS 'Business this staff member belongs to.';

-- Link existing staff to default business (JING CHENG seed).
UPDATE public.staff s
SET business_id = b.id
FROM public.businesses b
WHERE s.business_id IS NULL
  AND b.slug = 'jing-cheng';

CREATE UNIQUE INDEX IF NOT EXISTS staff_business_username_unique
  ON public.staff (business_id, lower(username))
  WHERE username IS NOT NULL;

NOTIFY pgrst, 'reload schema';
