-- Voucher complete flow: phone, apply≠redeem, applied-to-table. Safe to re-run.

ALTER TABLE public.voucher_orders
  ADD COLUMN IF NOT EXISTS buyer_phone text NOT NULL DEFAULT '';

ALTER TABLE public.voucher_codes
  ADD COLUMN IF NOT EXISTS applied_table_id text;

ALTER TABLE public.voucher_codes
  ADD COLUMN IF NOT EXISTS applied_at timestamptz;

ALTER TABLE public.voucher_codes
  ADD COLUMN IF NOT EXISTS applied_by_staff_id text;

ALTER TABLE public.voucher_codes
  ADD COLUMN IF NOT EXISTS applied_by_staff_name text;

ALTER TABLE public.voucher_codes
  ADD COLUMN IF NOT EXISTS redeemed_sale_id text;

-- Allow status = applied (scan/apply pending redemption).
ALTER TABLE public.voucher_codes DROP CONSTRAINT IF EXISTS voucher_codes_status_check;
ALTER TABLE public.voucher_codes
  ADD CONSTRAINT voucher_codes_status_check
  CHECK (status IN ('issued', 'applied', 'redeemed', 'cancelled', 'expired'));

CREATE INDEX IF NOT EXISTS voucher_codes_applied_table_idx
  ON public.voucher_codes (applied_table_id)
  WHERE status = 'applied';

NOTIFY pgrst, 'reload schema';
