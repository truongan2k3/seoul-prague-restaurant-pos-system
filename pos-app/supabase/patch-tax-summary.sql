-- Menu item VAT group + sale service channel for tax summary (Jídelna / S sebou)
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS tax_group text CHECK (tax_group IN ('A', 'B'));

UPDATE public.menu_items
SET tax_group = CASE WHEN item_type = 'drink' THEN 'A' ELSE 'B' END
WHERE tax_group IS NULL;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS service_channel text CHECK (service_channel IN ('dine_in', 'takeaway'));

COMMENT ON COLUMN public.menu_items.tax_group IS 'A = 21% (drinks), B = 12% (food).';
COMMENT ON COLUMN public.sales.service_channel IS 'dine_in = Jídelna, takeaway = S sebou.';
