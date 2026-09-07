-- Remove Andy / Kiên accounts; set delete passcode default to 8888.
-- Run in Supabase SQL editor (safe to re-run for Andy/Kiên + passcode).
-- NOTE: Do NOT re-insert Adam automatically — staff are managed in the POS Staff UI.
-- The optional INSERT below is commented; uncomment only for empty/dev DBs.

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

-- Optional one-time seed (commented — uncomment only for empty/dev DBs):
-- INSERT INTO public.staff (name, role, username, active, allowed_nav, pin, require_pin_for_actions, require_switch_password)
-- SELECT
--   'Adam',
--   'admin',
--   'adam',
--   true,
--   '["map","order","reservations","history","summary","storage","dynamicQr","staff","settings"]'::jsonb,
--   NULL,
--   false,
--   false
-- WHERE NOT EXISTS (
--   SELECT 1 FROM public.staff WHERE lower(trim(name)) = 'adam'
-- );

-- Manager / deletion passcode default → 8888
ALTER TABLE public.settings
  ALTER COLUMN admin_deletion_password SET DEFAULT '8888';

UPDATE public.settings
SET admin_deletion_password = '8888'
WHERE admin_deletion_password IS NULL
   OR trim(admin_deletion_password) = ''
   OR admin_deletion_password = '1234';
