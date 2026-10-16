BEGIN;
CREATE TABLE IF NOT EXISTS public.referral_codes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id),
 code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'),
 partner_name text NOT NULL CHECK(length(trim(partner_name))>0), partner_contact text NOT NULL DEFAULT '',
 active boolean NOT NULL DEFAULT true, discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK(discount_percent BETWEEN 0 AND 100),
 commission_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK(commission_percent BETWEEN 0 AND 100),
 min_spend numeric(12,2) NOT NULL DEFAULT 0 CHECK(min_spend>=0), expires_at timestamptz,
 usage_limit integer CHECK(usage_limit>0), usage_count integer NOT NULL DEFAULT 0,
 deduct_vouchers boolean NOT NULL DEFAULT false, deduct_other_discounts boolean NOT NULL DEFAULT true,
 exclude_tax boolean NOT NULL DEFAULT false, tax_rates jsonb NOT NULL DEFAULT '{"A":21,"B":12}',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS referral_code text,
 ADD COLUMN IF NOT EXISTS referral_code_id uuid REFERENCES public.referral_codes(id);
CREATE INDEX IF NOT EXISTS reservations_referral_idx ON public.reservations(referral_code_id,reserved_at);
CREATE TABLE IF NOT EXISTS public.referral_attributions (
 reservation_id uuid PRIMARY KEY REFERENCES public.reservations(id), code_id uuid NOT NULL REFERENCES public.referral_codes(id),
 business_id uuid NOT NULL, rules jsonb NOT NULL, locked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.referral_redemptions (
 reservation_id uuid PRIMARY KEY REFERENCES public.reservations(id), code_id uuid NOT NULL REFERENCES public.referral_codes(id),
 visit_subtotal numeric NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS referral_code_id uuid REFERENCES public.referral_codes(id),
 ADD COLUMN IF NOT EXISTS referral_snapshot jsonb, ADD COLUMN IF NOT EXISTS referral_discount_amount numeric(12,2) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS referral_payment_key uuid, ADD COLUMN IF NOT EXISTS referral_override_reason text,
 ADD COLUMN IF NOT EXISTS referral_installment integer,
 ADD COLUMN IF NOT EXISTS referral_visit_subtotal numeric(12,2), ADD COLUMN IF NOT EXISTS referral_discount_percent numeric(5,2);
ALTER TABLE public.referral_codes ADD COLUMN IF NOT EXISTS updated_by uuid, ADD COLUMN IF NOT EXISTS updated_by_name text;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS referral_override_reason text, ADD COLUMN IF NOT EXISTS referral_changed_by uuid;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS referral_code_version timestamptz,
 ADD COLUMN IF NOT EXISTS referral_actor_id uuid, ADD COLUMN IF NOT EXISTS referral_actor_name text,
 ADD COLUMN IF NOT EXISTS referral_adjustment_reason text;
CREATE UNIQUE INDEX IF NOT EXISTS sales_referral_payment_key_idx ON public.sales(referral_payment_key) WHERE referral_payment_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sales_referral_full_visit ON public.sales(table_id,seated_at) WHERE referral_code_id IS NOT NULL AND split_mode='total' AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sales_referral_installment_idx ON public.sales(table_id,seated_at,referral_installment) WHERE referral_code_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_referral_idx ON public.sales(referral_code_id,closed_at);
CREATE TABLE IF NOT EXISTS public.referral_commissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL, code_id uuid NOT NULL REFERENCES public.referral_codes(id),
 sale_id uuid NOT NULL REFERENCES public.sales(id), reservation_id uuid NOT NULL REFERENCES public.reservations(id),
 kind text NOT NULL CHECK(kind IN ('earned','adjustment')), amount numeric(12,2) NOT NULL,
 eligible_amount numeric(12,2) NOT NULL, gross_amount numeric(12,2) NOT NULL, discount_amount numeric(12,2) NOT NULL,
 rules jsonb NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS referral_one_earning_per_sale ON public.referral_commissions(sale_id) WHERE kind='earned';
CREATE INDEX IF NOT EXISTS referral_commissions_date_idx ON public.referral_commissions(business_id,created_at,code_id);
CREATE TABLE IF NOT EXISTS public.referral_payouts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL, code_id uuid NOT NULL REFERENCES public.referral_codes(id),
 amount numeric(12,2) NOT NULL CHECK(amount>0), paid_at timestamptz NOT NULL, notes text NOT NULL DEFAULT '',
 actor_id uuid NOT NULL, actor_name text NOT NULL, request_key uuid NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_payouts_business_date_idx ON public.referral_payouts(business_id,paid_at,code_id);
CREATE TABLE IF NOT EXISTS public.referral_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL, code_id uuid REFERENCES public.referral_codes(id),
 action text NOT NULL, actor_id uuid, actor_name text NOT NULL DEFAULT 'System', details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_audit_business_date_idx ON public.referral_audit(business_id,created_at,code_id);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['referral_codes','referral_attributions','referral_redemptions','referral_commissions','referral_payouts','referral_audit'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END $$;
COMMIT;
