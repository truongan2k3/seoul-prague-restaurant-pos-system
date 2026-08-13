-- Bill-only menu items: saved on the table bill only — no kitchen, bar, or print.
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS bill_only boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.menu_items.bill_only IS
  'When true, orders of this item skip kitchen/bar screens and print; line appears on bill only.';
