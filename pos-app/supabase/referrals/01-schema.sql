-- STEP 1 OF 3: tables and accounting triggers
-- Referral program. Apply after the existing business/staff/reservation/sales patches.
-- New private tables have no anonymous policies. Only checked server actions use service_role.
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

CREATE OR REPLACE FUNCTION public.validate_referral_code(p_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.referral_codes;
BEGIN
 SELECT * INTO c FROM referral_codes WHERE code=upper(trim(p_code));
 IF NOT FOUND OR NOT c.active OR (c.expires_at IS NOT NULL AND c.expires_at<=now()) OR (c.usage_limit IS NOT NULL AND c.usage_count>=c.usage_limit) THEN
  RETURN jsonb_build_object('valid',false,'message','This referral code is invalid, expired, or fully used.');
 END IF;
 RETURN jsonb_build_object('valid',true,'code',c.code,'discountPercent',c.discount_percent,'minSpend',c.min_spend,'message','Referral code accepted. Eligibility is checked at payment.');
END $$;
REVOKE ALL ON FUNCTION public.validate_referral_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_referral_code(text) TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.referral_reservation_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c referral_codes; changed boolean;
BEGIN
 IF TG_OP='INSERT' THEN changed:=true;
 ELSE
  changed:=NEW.referral_code IS DISTINCT FROM OLD.referral_code OR NEW.referral_code_id IS DISTINCT FROM OLD.referral_code_id;
  IF NOT changed THEN RETURN NEW; END IF;
  IF OLD.checked_in_at IS NOT NULL OR OLD.status IN ('checked_in','completed') OR EXISTS(SELECT 1 FROM referral_attributions WHERE reservation_id=OLD.id AND locked_at IS NOT NULL) THEN
   IF auth.role() IS DISTINCT FROM 'service_role' OR nullif(current_setting('seoul.referral_override',true),'') IS NULL THEN RAISE EXCEPTION 'Only authorized staff may change a checked-in referral.'; END IF;
  END IF;
 END IF;
 NEW.referral_code:=nullif(upper(trim(NEW.referral_code)),'');
 IF NEW.referral_code IS NULL THEN NEW.referral_code_id:=NULL; RETURN NEW; END IF;
 SELECT * INTO c FROM referral_codes WHERE code=NEW.referral_code FOR UPDATE;
 IF NOT FOUND OR NOT c.active OR (c.expires_at IS NOT NULL AND c.expires_at<=now()) OR (c.usage_limit IS NOT NULL AND c.usage_count>=c.usage_limit) THEN RAISE EXCEPTION 'Referral code is inactive, expired, or fully used.'; END IF;
 NEW.referral_code_id:=c.id;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS referral_reservation_guard ON public.reservations;
CREATE TRIGGER referral_reservation_guard BEFORE INSERT OR UPDATE OF referral_code,referral_code_id ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.referral_reservation_guard();
CREATE OR REPLACE FUNCTION public.referral_capture_attribution() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c referral_codes;
BEGIN
 IF TG_OP='UPDATE' AND NEW.referral_code_id IS NOT DISTINCT FROM OLD.referral_code_id THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM sales WHERE reservation_id=NEW.id) THEN RAISE EXCEPTION 'Referral cannot change after a payment. Reverse the payment first.'; END IF;
 DELETE FROM referral_attributions WHERE reservation_id=NEW.id;
 IF NEW.referral_code_id IS NOT NULL THEN
  SELECT * INTO c FROM referral_codes WHERE id=NEW.referral_code_id;
  INSERT INTO referral_attributions(reservation_id,code_id,business_id,rules,locked_at) VALUES(NEW.id,c.id,c.business_id,to_jsonb(c)-'partner_contact',CASE WHEN NEW.checked_in_at IS NOT NULL OR NEW.status IN ('checked_in','completed') THEN now() ELSE NULL END);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS referral_capture_attribution ON public.reservations;
CREATE TRIGGER referral_capture_attribution AFTER INSERT OR UPDATE OF referral_code_id ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.referral_capture_attribution();

CREATE OR REPLACE FUNCTION public.referral_lock_attribution() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF NEW.checked_in_at IS NOT NULL OR NEW.status IN ('checked_in','completed') THEN UPDATE referral_attributions SET locked_at=coalesce(locked_at,now()) WHERE reservation_id=NEW.id; END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS referral_lock_attribution ON public.reservations;
CREATE TRIGGER referral_lock_attribution AFTER UPDATE OF status,checked_in_at ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.referral_lock_attribution();

CREATE OR REPLACE FUNCTION public.referral_sale_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a referral_attributions; c referral_codes; eligible boolean; used boolean;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.referral_code_id IS NULL THEN
   IF NEW.referral_code_id IS NOT NULL OR NEW.referral_snapshot IS NOT NULL THEN RAISE EXCEPTION 'Cannot attach a referral retroactively to a payment.'; END IF;
   RETURN NEW;
  END IF;
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Referral payment adjustments require authorized staff.'; END IF;
  PERFORM 1 FROM referral_codes WHERE id=OLD.referral_code_id FOR UPDATE;
  NEW.referral_code_id:=OLD.referral_code_id; NEW.referral_snapshot:=OLD.referral_snapshot;
  NEW.referral_payment_key:=OLD.referral_payment_key; NEW.reservation_id:=OLD.reservation_id;
  NEW.referral_discount_percent:=OLD.referral_discount_percent;
  NEW.referral_discount_amount:=OLD.referral_discount_amount;
  IF NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount THEN
   NEW.referral_discount_amount:=least(NEW.discount_amount,round(coalesce(OLD.referral_discount_amount*NEW.subtotal/nullif(OLD.subtotal,0),0),2));
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.reservation_id IS NULL THEN
  SELECT r.id INTO NEW.reservation_id FROM reservations r WHERE r.status='checked_in' AND r.referral_code_id IS NOT NULL AND NEW.table_id IN (r.table_id,r.secondary_table_id,r.tertiary_table_id) ORDER BY r.checked_in_at DESC LIMIT 1;
 END IF;
 SELECT * INTO a FROM referral_attributions WHERE reservation_id=NEW.reservation_id;
 IF NOT FOUND THEN
  IF NEW.referral_code_id IS NOT NULL OR NEW.referral_snapshot IS NOT NULL THEN RAISE EXCEPTION 'Unknown referral attribution.'; END IF;
  RETURN NEW;
 END IF;
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Referral payments require the secure checkout action.'; END IF;
 IF NEW.referral_payment_key IS NULL THEN RAISE EXCEPTION 'Referral payment idempotency key is required.'; END IF;
 SELECT * INTO c FROM referral_codes WHERE id=a.code_id FOR UPDATE;
 SELECT EXISTS(SELECT 1 FROM referral_redemptions WHERE reservation_id=NEW.reservation_id) INTO used;
 eligible:=c.active AND (c.expires_at IS NULL OR c.expires_at>now()) AND (used OR c.usage_limit IS NULL OR c.usage_count<c.usage_limit)
  AND coalesce(NEW.referral_visit_subtotal,0)>=(a.rules->>'min_spend')::numeric;
 IF NOT eligible AND coalesce(NEW.referral_discount_percent,0)>0 AND nullif(NEW.referral_override_reason,'') IS NULL THEN RAISE EXCEPTION 'Referral eligibility changed. Refresh checkout.'; END IF;
 NEW.referral_code_id:=a.code_id;
 NEW.referral_snapshot:=jsonb_build_object('eligible',eligible,'business_id',a.business_id,'code',a.rules->>'code','partner_name',a.rules->>'partner_name');
 IF eligible AND NOT used THEN
  INSERT INTO referral_redemptions(reservation_id,code_id,visit_subtotal) VALUES(NEW.reservation_id,c.id,NEW.referral_visit_subtotal);
  UPDATE referral_codes SET usage_count=usage_count+1 WHERE id=c.id;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS referral_sale_guard ON public.sales;
CREATE TRIGGER referral_sale_guard BEFORE INSERT OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.referral_sale_guard();

CREATE OR REPLACE FUNCTION public.referral_record_commission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rules jsonb; base numeric:=0; target numeric:=0; previous numeric:=0; previous_base numeric:=0;
 previous_gross numeric:=0; previous_discount numeric:=0; gross numeric:=0; discount numeric:=0; factor numeric:=1;
BEGIN
 IF NEW.referral_code_id IS NULL THEN RETURN NEW; END IF;
 SELECT a.rules || NEW.referral_snapshot || jsonb_build_object('applied_discount_percent',NEW.referral_discount_percent) INTO rules FROM referral_attributions a WHERE a.reservation_id=NEW.reservation_id;
 IF NEW.deleted_at IS NULL THEN gross:=NEW.subtotal; discount:=NEW.referral_discount_amount; END IF;
 IF NEW.deleted_at IS NULL AND coalesce((rules->>'eligible')::boolean,false) THEN
  base:=greatest(0,NEW.subtotal-CASE WHEN coalesce((rules->>'deduct_other_discounts')::boolean,true) THEN NEW.discount_amount ELSE NEW.referral_discount_amount END
   -CASE WHEN coalesce((rules->>'deduct_vouchers')::boolean,false) THEN NEW.voucher_discount_amount ELSE 0 END);
  IF coalesce((rules->>'exclude_tax')::boolean,false) THEN
   SELECT coalesce(sum((j->>'price')::numeric*(j->>'quantity')::numeric/(1+coalesce((rules->'tax_rates'->>coalesce(j->>'taxGroup','B'))::numeric,12)/100))/nullif(sum((j->>'price')::numeric*(j->>'quantity')::numeric),0),1)
    INTO factor FROM jsonb_array_elements(NEW.items) j;
   base:=base*factor;
  END IF;
  base:=round(base,2); target:=round(base*(rules->>'commission_percent')::numeric/100,2);
 END IF;
 SELECT coalesce(sum(amount),0),coalesce(sum(eligible_amount),0),coalesce(sum(gross_amount),0),coalesce(sum(discount_amount),0)
  INTO previous,previous_base,previous_gross,previous_discount FROM referral_commissions WHERE sale_id=NEW.id;
 IF TG_OP='INSERT' OR target<>previous OR base<>previous_base OR gross<>previous_gross OR discount<>previous_discount THEN
  INSERT INTO referral_commissions(business_id,code_id,sale_id,reservation_id,kind,amount,eligible_amount,gross_amount,discount_amount,rules,reason)
  VALUES((rules->>'business_id')::uuid,NEW.referral_code_id,NEW.id,NEW.reservation_id,CASE WHEN TG_OP='INSERT' THEN 'earned' ELSE 'adjustment' END,
   target-previous,base-previous_base,gross-previous_gross,discount-previous_discount,rules,
   CASE WHEN TG_OP='INSERT' THEN 'Successful payment' WHEN NEW.deleted_at IS NOT NULL THEN 'Payment void / reversal' ELSE 'Payment financial adjustment / refund' END);
  INSERT INTO referral_audit(business_id,code_id,action,actor_name,details) VALUES((rules->>'business_id')::uuid,NEW.referral_code_id,'commission_'||lower(TG_OP),coalesce(current_setting('seoul.referral_actor_name',true),'System'),jsonb_build_object('saleId',NEW.id,'delta',target-previous));
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS referral_record_commission ON public.sales;
CREATE TRIGGER referral_record_commission AFTER INSERT OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.referral_record_commission();
CREATE OR REPLACE FUNCTION public.referral_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Referral ledger and audit records are append-only.'; END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['referral_commissions','referral_payouts','referral_audit'] LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS referral_immutable ON public.%I',t);
 EXECUTE format('CREATE TRIGGER referral_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.referral_immutable()',t);
END LOOP; END $$;
-- Do not permit deleting a referred sale and cascading away its financial history.
CREATE OR REPLACE FUNCTION public.referral_protect_sale_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.referral_code_id IS NOT NULL THEN RAISE EXCEPTION 'Void referral payments; do not delete their immutable history.'; END IF; RETURN OLD; END $$;
DROP TRIGGER IF EXISTS referral_protect_sale_delete ON public.sales;
CREATE TRIGGER referral_protect_sale_delete BEFORE DELETE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.referral_protect_sale_delete();


COMMIT;
