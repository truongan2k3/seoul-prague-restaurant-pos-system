-- Voucher payment window (15 min). Safe to re-run.

ALTER TABLE public.voucher_orders
  ADD COLUMN IF NOT EXISTS payment_expires_at timestamptz;

ALTER TABLE public.voucher_orders
  ADD COLUMN IF NOT EXISTS guest_marked_paid_at timestamptz;

ALTER TABLE public.voucher_orders
  ADD COLUMN IF NOT EXISTS public_token text;

CREATE UNIQUE INDEX IF NOT EXISTS voucher_orders_public_token_uidx
  ON public.voucher_orders (public_token)
  WHERE public_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS voucher_orders_payment_expires_idx
  ON public.voucher_orders (payment_expires_at)
  WHERE payment_status = 'pending' AND guest_marked_paid_at IS NULL;

NOTIFY pgrst, 'reload schema';
