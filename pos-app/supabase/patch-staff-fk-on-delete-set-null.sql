-- Allow deleting staff when sales/history rows still reference them.
-- Safe to run multiple times.

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_staff_id_fkey;
ALTER TABLE public.sales
  ADD CONSTRAINT sales_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_staff_id_fkey;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;

ALTER TABLE public.action_logs DROP CONSTRAINT IF EXISTS action_logs_staff_id_fkey;
ALTER TABLE public.action_logs
  ADD CONSTRAINT action_logs_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reservations' AND column_name = 'staff_id'
  ) THEN
    ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_staff_id_fkey;
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_staff_id_fkey
      FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
