-- Checkout payment metrics: run in Supabase SQL Editor

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_type text CHECK (discount_type IN ('percent', 'fixed')),
  ADD COLUMN IF NOT EXISTS discount_value numeric(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grand_total numeric(10, 2),
  ADD COLUMN IF NOT EXISTS amount_given numeric(10, 2),
  ADD COLUMN IF NOT EXISTS change_due numeric(10, 2),
  ADD COLUMN IF NOT EXISTS split_mode text CHECK (split_mode IN ('total', 'equal', 'items')),
  ADD COLUMN IF NOT EXISTS split_count int DEFAULT 1;

UPDATE public.sales
SET grand_total = subtotal + tip - COALESCE(discount_amount, 0)
WHERE grand_total IS NULL;
