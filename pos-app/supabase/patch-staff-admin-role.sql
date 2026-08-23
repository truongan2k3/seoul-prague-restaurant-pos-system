-- Ensure admin staff accounts can manage the team (role + full nav).
-- Safe to run multiple times.

UPDATE public.staff
SET role = 'admin',
    allowed_nav = NULL
WHERE lower(username) IN ('admin', 'adam')
   OR lower(name) IN ('andy', 'admin', 'adam');

-- Optional: list current staff roles
SELECT name, username, role, allowed_nav FROM public.staff ORDER BY name;

NOTIFY pgrst, 'reload schema';
