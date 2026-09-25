-- Voucher orders + issued codes. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.voucher_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL UNIQUE,
  buyer_name text NOT NULL DEFAULT '',
  buyer_email text NOT NULL,
  denomination_czk integer NOT NULL CHECK (denomination_czk > 0),
  quantity integer NOT NULL CHECK (quantity > 0 AND quantity <= 50),
  total_czk integer NOT NULL CHECK (total_czk > 0),
  payment_method text NOT NULL DEFAULT 'bank_transfer'
    CHECK (payment_method IN ('bank_transfer', 'czech_qr')),
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'cancelled', 'refunded')),
  order_status text NOT NULL DEFAULT 'pending_verification'
    CHECK (order_status IN (
      'pending_verification',
      'paid',
      'issued',
      'partially_redeemed',
      'fully_redeemed',
      'cancelled'
    )),
  payment_message text,
  notes text,
  payment_expires_at timestamptz,
  guest_marked_paid_at timestamptz,
  public_token text,
  verified_at timestamptz,
  verified_by_staff_id text,
  verified_by_staff_name text,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voucher_orders_created_idx
  ON public.voucher_orders (created_at DESC);

CREATE INDEX IF NOT EXISTS voucher_orders_email_idx
  ON public.voucher_orders (buyer_email);

CREATE INDEX IF NOT EXISTS voucher_orders_status_idx
  ON public.voucher_orders (payment_status, order_status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS voucher_orders_public_token_uidx
  ON public.voucher_orders (public_token)
  WHERE public_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS voucher_orders_payment_expires_idx
  ON public.voucher_orders (payment_expires_at)
  WHERE payment_status = 'pending' AND guest_marked_paid_at IS NULL;

CREATE TABLE IF NOT EXISTS public.voucher_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_uuid uuid NOT NULL REFERENCES public.voucher_orders(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  denomination_czk integer NOT NULL CHECK (denomination_czk > 0),
  status text NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued', 'redeemed', 'cancelled', 'expired')),
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_by_staff_id text,
  redeemed_by_staff_name text,
  redeemed_table_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voucher_codes_order_idx
  ON public.voucher_codes (order_uuid);

CREATE INDEX IF NOT EXISTS voucher_codes_status_idx
  ON public.voucher_codes (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.voucher_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_uuid uuid REFERENCES public.voucher_orders(id) ON DELETE SET NULL,
  voucher_code_id uuid REFERENCES public.voucher_codes(id) ON DELETE SET NULL,
  action text NOT NULL,
  staff_id text,
  staff_name text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voucher_audit_order_idx
  ON public.voucher_audit_logs (order_uuid, created_at DESC);

ALTER TABLE public.voucher_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_audit_logs ENABLE ROW LEVEL SECURITY;

-- Public may INSERT orders only via server (service role). Anon read blocked.
DROP POLICY IF EXISTS "voucher_orders_service" ON public.voucher_orders;
CREATE POLICY "voucher_orders_service"
  ON public.voucher_orders
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "voucher_codes_service" ON public.voucher_codes;
CREATE POLICY "voucher_codes_service"
  ON public.voucher_codes
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "voucher_audit_service" ON public.voucher_audit_logs;
CREATE POLICY "voucher_audit_service"
  ON public.voucher_audit_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS voucher_config jsonb NOT NULL DEFAULT '{
    "enabled": true,
    "denominationsCzk": [1000, 2000, 3000, 5000],
    "bankName": "",
    "accountHolder": "",
    "accountNumber": "",
    "iban": "",
    "bicSwift": "",
    "bankPaymentNote": "",
    "validityDays": 365,
    "processingMessage": "Thank you for ordering a voucher. We will process your order within 24 hours. After payment is confirmed, voucher codes will be sent to this email.",
    "confirmationEmailSubject": "Voucher order received",
    "issuedEmailSubject": "Your Seoul Prague voucher"
  }'::jsonb;

NOTIFY pgrst, 'reload schema';
