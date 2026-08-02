-- Staff management: active flag, admin role, write access
-- Run in Supabase SQL Editor (safe to re-run)

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- 1) Drop the old role check FIRST (cashier-only constraint blocks 'admin')
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_role_check;

-- 2) Allow admin + legacy cashier during migration
ALTER TABLE public.staff
  ADD CONSTRAINT staff_role_check
  CHECK (role IN ('admin', 'manager', 'server', 'kitchen', 'bar', 'cashier'));

-- 3) Migrate legacy cashier rows to admin
UPDATE public.staff SET role = 'admin' WHERE role = 'cashier';

-- 4) Tighten constraint (cashier no longer needed)
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_role_check;
ALTER TABLE public.staff
  ADD CONSTRAINT staff_role_check
  CHECK (role IN ('admin', 'manager', 'server', 'kitchen', 'bar'));

DROP POLICY IF EXISTS "staff_write" ON public.staff;
CREATE POLICY "staff_write" ON public.staff
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
