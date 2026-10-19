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
   IF auth.role() IS DISTINCT FROM 'service_role' OR nullif(NEW.referral_override_reason,'') IS NULL THEN RAISE EXCEPTION 'Only authorized staff may change a checked-in referral.'; END IF;
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
 IF TG_OP='UPDATE' THEN
  INSERT INTO referral_audit(business_id,code_id,action,actor_id,actor_name,details)
  SELECT a.business_id,a.code_id,'reservation_referral_changed',NEW.referral_changed_by,coalesce((SELECT name FROM staff WHERE id=NEW.referral_changed_by),'Guest'),jsonb_build_object('reservationId',NEW.id,'reason',NEW.referral_override_reason,'code',NEW.referral_code)
  FROM referral_attributions a WHERE a.reservation_id=NEW.id;
 END IF;
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
DECLARE a referral_attributions; c referral_codes; eligible boolean; used boolean; visit timestamptz; next_installment integer;
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
 IF c.updated_at IS DISTINCT FROM NEW.referral_code_version THEN RAISE EXCEPTION 'Referral changed. Refresh checkout.'; END IF;
 SELECT occupied_at INTO visit FROM tables WHERE id=NEW.table_id FOR UPDATE;
 IF visit IS NULL THEN SELECT created_at INTO visit FROM order_items WHERE table_id=NEW.table_id ORDER BY created_at LIMIT 1; END IF;
 IF visit IS NULL THEN SELECT checked_in_at INTO visit FROM reservations WHERE id=NEW.reservation_id; END IF;
 IF visit IS DISTINCT FROM NEW.seated_at THEN RAISE EXCEPTION 'Table visit changed. Refresh checkout.'; END IF;
 SELECT coalesce(max(referral_installment),0)+1 INTO next_installment FROM sales WHERE table_id=NEW.table_id AND seated_at IS NOT DISTINCT FROM visit;
 IF NEW.referral_installment IS DISTINCT FROM next_installment THEN RAISE EXCEPTION 'Another payment was recorded. Refresh checkout.'; END IF;

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
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $commission$
DECLARE rules jsonb; original_rules jsonb; base numeric:=0; target numeric:=0;
 previous numeric:=0; previous_base numeric:=0; previous_gross numeric:=0;
 previous_discount numeric:=0; gross numeric:=0; discount numeric:=0; factor numeric:=1;
BEGIN
 IF NEW.referral_code_id IS NULL THEN RETURN NEW; END IF;
 SELECT a.rules || NEW.referral_snapshot || jsonb_build_object('applied_discount_percent',NEW.referral_discount_percent)
 INTO rules FROM referral_attributions a WHERE a.reservation_id=NEW.reservation_id;
 SELECT l.rules INTO original_rules FROM referral_commissions l
 WHERE l.sale_id=NEW.id AND l.kind='earned' ORDER BY l.created_at LIMIT 1;
 IF TG_OP='INSERT' OR original_rules IS NULL THEN
  rules:=rules || jsonb_build_object('commission_basis','subtotal','exclude_tax',false,
   'deduct_vouchers',false,'deduct_other_discounts',false);
 ELSE
  -- Refunds/reversals retain the rules recorded by the original payment.
  rules:=original_rules || NEW.referral_snapshot || jsonb_build_object('applied_discount_percent',NEW.referral_discount_percent);
 END IF;
 IF NEW.deleted_at IS NULL THEN gross:=NEW.subtotal; discount:=NEW.referral_discount_amount; END IF;
 IF NEW.deleted_at IS NULL AND coalesce((rules->>'eligible')::boolean,false) THEN
  IF rules->>'commission_basis'='subtotal' THEN
   base:=greatest(0,NEW.subtotal);
  ELSE
   -- Keep historical payment adjustments consistent with their original earnings.
   base:=greatest(0,NEW.subtotal-CASE WHEN coalesce((rules->>'deduct_other_discounts')::boolean,true) THEN NEW.discount_amount ELSE NEW.referral_discount_amount END
    -CASE WHEN coalesce((rules->>'deduct_vouchers')::boolean,false) THEN NEW.voucher_discount_amount ELSE 0 END);
   IF coalesce((rules->>'exclude_tax')::boolean,false) THEN
    SELECT coalesce(sum((j->>'price')::numeric*(j->>'quantity')::numeric/(1+coalesce((rules->'tax_rates'->>coalesce(j->>'taxGroup','B'))::numeric,12)/100))/nullif(sum((j->>'price')::numeric*(j->>'quantity')::numeric),0),1)
    INTO factor FROM jsonb_array_elements(NEW.items) j;
    base:=base*factor;
   END IF;
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
  INSERT INTO referral_audit(business_id,code_id,action,actor_id,actor_name,details)
  VALUES((rules->>'business_id')::uuid,NEW.referral_code_id,'commission_'||lower(TG_OP),NEW.referral_actor_id,coalesce(NEW.referral_actor_name,NEW.staff_name,'System'),jsonb_build_object('saleId',NEW.id,'delta',target-previous,'reason',coalesce(NEW.referral_adjustment_reason,NEW.referral_override_reason)));
 ELSIF TG_OP='UPDATE' AND NEW IS DISTINCT FROM OLD THEN
  INSERT INTO referral_audit(business_id,code_id,action,actor_id,actor_name,details)
  VALUES((rules->>'business_id')::uuid,NEW.referral_code_id,'payment_adjusted',NEW.referral_actor_id,coalesce(NEW.referral_actor_name,'System'),jsonb_build_object('saleId',NEW.id,'reason',NEW.referral_adjustment_reason));
 END IF;
 RETURN NEW;
END;
$commission$;
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

-- Ordinary server inserts/updates; no separate management/payment RPC layer.
CREATE OR REPLACE FUNCTION public.referral_admin_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c referral_codes; balance numeric; actor_id uuid; actor_name text; details jsonb; code_id uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required'; END IF;
 IF TG_TABLE_NAME='referral_codes' THEN
  IF TG_OP='UPDATE' THEN
   IF (to_jsonb(NEW)-ARRAY['usage_count','updated_at'])=(to_jsonb(OLD)-ARRAY['usage_count','updated_at']) THEN RETURN NEW; END IF;
   IF NEW.partner_name<>OLD.partner_name AND EXISTS(SELECT 1 FROM referral_attributions WHERE referral_attributions.code_id=OLD.id) THEN RAISE EXCEPTION 'Create a new code to change an attributed partner.'; END IF;
  END IF;
  code_id:=NEW.id; actor_id:=NEW.updated_by; actor_name:=NEW.updated_by_name;
  details:=jsonb_build_object('after',to_jsonb(NEW)); IF TG_OP='UPDATE' THEN details:=details||jsonb_build_object('before',to_jsonb(OLD)); END IF;
 ELSE
  SELECT * INTO c FROM referral_codes WHERE id=NEW.code_id AND business_id=NEW.business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Code not found'; END IF;
  SELECT coalesce((SELECT sum(amount) FROM referral_commissions WHERE referral_commissions.code_id=c.id),0)-coalesce((SELECT sum(amount) FROM referral_payouts WHERE referral_payouts.code_id=c.id),0) INTO balance;
  IF NEW.amount>balance OR NEW.amount<=0 OR NEW.paid_at>now() THEN RAISE EXCEPTION 'Invalid payout or amount exceeds outstanding balance'; END IF;
  code_id:=NEW.code_id; actor_id:=NEW.actor_id; actor_name:=NEW.actor_name; details:=to_jsonb(NEW);
 END IF;
 INSERT INTO referral_audit(business_id,code_id,action,actor_id,actor_name,details) VALUES(NEW.business_id,code_id,TG_TABLE_NAME||'_'||lower(TG_OP),actor_id,coalesce(actor_name,'System'),details);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS referral_admin_audit ON public.referral_codes;
CREATE TRIGGER referral_admin_audit AFTER INSERT OR UPDATE ON public.referral_codes FOR EACH ROW EXECUTE FUNCTION public.referral_admin_audit();
DROP TRIGGER IF EXISTS referral_admin_audit ON public.referral_payouts;
CREATE TRIGGER referral_admin_audit BEFORE INSERT ON public.referral_payouts FOR EACH ROW EXECUTE FUNCTION public.referral_admin_audit();

CREATE OR REPLACE VIEW public.referral_balances AS
 SELECT c.id AS code_id,c.business_id,
 coalesce((SELECT sum(amount) FROM public.referral_commissions l WHERE l.code_id=c.id),0) AS earned,
 coalesce((SELECT sum(amount) FROM public.referral_payouts p WHERE p.code_id=c.id),0) AS paid,
 coalesce((SELECT sum(amount) FROM public.referral_commissions l WHERE l.code_id=c.id),0)-coalesce((SELECT sum(amount) FROM public.referral_payouts p WHERE p.code_id=c.id),0) AS outstanding
 FROM public.referral_codes c;
CREATE OR REPLACE VIEW public.referral_reservation_history AS
 SELECT r.id,r.referral_code_id,a.business_id,r.guest_name,r.party_size,r.actual_party_size,r.reserved_at,r.checked_in_at,r.status,r.table_id,r.booking_code,
 EXISTS(SELECT 1 FROM public.sales s WHERE s.reservation_id=r.id AND s.referral_code_id=a.code_id AND s.deleted_at IS NULL) AS has_paid
 FROM public.reservations r JOIN public.referral_attributions a ON a.reservation_id=r.id;
REVOKE ALL ON public.referral_balances,public.referral_reservation_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.referral_balances,public.referral_reservation_history TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
