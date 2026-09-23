-- Gift voucher amount/codes on completed sales (History ticket + audit).
-- Food revenue stays on subtotal − discount; voucher is prepaid redemption, not a food discount.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS voucher_discount_amount numeric(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS voucher_codes text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.sales.voucher_discount_amount IS
  'Gift voucher value applied at checkout (reduces amount collected, not food revenue).';

COMMENT ON COLUMN public.sales.voucher_codes IS
  'Voucher codes redeemed with this sale.';
