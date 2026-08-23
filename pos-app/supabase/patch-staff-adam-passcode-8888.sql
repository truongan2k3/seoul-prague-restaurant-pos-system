-- Keep only Adam as admin; remove Andy / Kiên accounts; set delete passcode to 8888.
-- Run in Supabase SQL editor (safe to re-run).

-- Soft-clear FK refs then delete unwanted staff by name / username.
DO $$
DECLARE
  unwanted uuid;
BEGIN
  FOR unwanted IN
    SELECT id
    FROM public.staff
    WHERE lower(trim(name)) IN ('andy', 'kien', 'kiên')
       OR lower(trim(coalesce(username, ''))) IN ('andy', 'kien', 'kiên')
  LOOP
    UPDATE public.sales SET staff_id = NULL WHERE staff_id = unwanted;
    UPDATE public.order_items SET staff_id = NULL WHERE staff_id = unwanted;
    UPDATE public.action_logs SET staff_id = NULL WHERE staff_id = unwanted;
    UPDATE public.reservations SET staff_id = NULL WHERE staff_id = unwanted;
    DELETE FROM public.staff WHERE id = unwanted;
  END LOOP;
END $$;

-- Ensure Adam admin exists (one row).
INSERT INTO public.staff (name, role, username, active, allowed_nav, pin, require_pin_for_actions, require_switch_password)
SELECT
  'Adam',
  'admin',
  'adam',
  true,
  '["map","order","reservations","history","summary","storage","dynamicQr","staff","settings"]'::jsonb,
  NULL,
  false,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM public.staff WHERE lower(trim(name)) = 'adam'
);

UPDATE public.staff
SET
  role = 'admin',
  active = true,
  username = coalesce(nullif(trim(username), ''), 'adam'),
  require_pin_for_actions = false,
  require_switch_password = false,
  allowed_nav = coalesce(
    allowed_nav,
    '["map","order","reservations","history","summary","storage","dynamicQr","staff","settings"]'::jsonb
  )
WHERE lower(trim(name)) = 'adam';

-- Manager / deletion passcode default → 8888
ALTER TABLE public.settings
  ALTER COLUMN admin_deletion_password SET DEFAULT '8888';

UPDATE public.settings
SET admin_deletion_password = '8888'
WHERE admin_deletion_password IS NULL
   OR trim(admin_deletion_password) = ''
   OR admin_deletion_password = '1234';
