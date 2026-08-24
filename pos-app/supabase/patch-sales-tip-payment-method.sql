-- Separate tip tender from bill payment (e.g. card bill + cash tip).
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS tip_payment_method text
  CHECK (tip_payment_method IS NULL OR tip_payment_method IN ('cash', 'card'));

COMMENT ON COLUMN public.sales.tip_payment_method IS
  'How tip was collected. NULL = same as payment_method.';
