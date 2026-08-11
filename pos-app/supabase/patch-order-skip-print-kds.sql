-- Send options: skip kitchen/bar print and/or hide from KDS/Bar boards
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS skip_print boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_on_kds boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.order_items.skip_print IS
  'When true, do not print this line on kitchen/bar ticket or Print Station.';
COMMENT ON COLUMN public.order_items.hide_on_kds IS
  'When true, do not show this line on kitchen/bar display or new-order alerts.';
