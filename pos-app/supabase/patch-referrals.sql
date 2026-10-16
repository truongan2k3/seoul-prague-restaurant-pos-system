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

CREATE OR REPLACE FUNCTION public.referral_commit_sale(p_sale jsonb,p_business uuid,p_actor uuid,p_version timestamptz) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid; a referral_attributions; c referral_codes; cols text; vals text; actor staff; next_installment integer; visit timestamptz;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 SELECT * INTO actor FROM staff WHERE id=p_actor AND business_id=p_business AND active;
 IF NOT FOUND OR actor.role NOT IN ('admin','manager','server','cashier') THEN RAISE EXCEPTION 'Unauthorized staff'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_sale->>'referral_payment_key',0));
 SELECT id INTO result FROM sales WHERE referral_payment_key=(p_sale->>'referral_payment_key')::uuid;
 IF FOUND THEN
  IF NOT EXISTS(SELECT 1 FROM sales WHERE id=result AND referral_snapshot->>'business_id'=p_business::text) THEN RAISE EXCEPTION 'Payment key conflict'; END IF;
  RETURN result;
 END IF;
 SELECT * INTO a FROM referral_attributions WHERE reservation_id=(p_sale->>'reservation_id')::uuid;
 IF NOT FOUND OR a.business_id<>p_business THEN RAISE EXCEPTION 'Referral does not belong to this business'; END IF;
 SELECT * INTO c FROM referral_codes WHERE id=a.code_id FOR UPDATE;
 IF c.updated_at<>p_version THEN RAISE EXCEPTION 'Referral changed. Reopen checkout to refresh the offer.'; END IF;
 SELECT occupied_at INTO visit FROM tables WHERE id=(p_sale->>'table_id')::uuid FOR UPDATE;
 IF visit IS NULL THEN SELECT created_at INTO visit FROM order_items WHERE table_id=(p_sale->>'table_id')::uuid ORDER BY created_at LIMIT 1; END IF;
 IF visit IS NULL THEN SELECT checked_in_at INTO visit FROM reservations WHERE id=(p_sale->>'reservation_id')::uuid; END IF;
 IF visit IS DISTINCT FROM (p_sale->>'seated_at')::timestamptz THEN RAISE EXCEPTION 'Table visit changed. Refresh checkout.'; END IF;
 SELECT coalesce(max(referral_installment),0)+1 INTO next_installment FROM sales WHERE table_id=(p_sale->>'table_id')::uuid AND seated_at IS NOT DISTINCT FROM visit;
 IF (p_sale->>'referral_installment')::integer IS DISTINCT FROM next_installment THEN RAISE EXCEPTION 'Another payment was recorded. Refresh checkout before continuing.'; END IF;
 PERFORM 1 FROM order_items WHERE table_id=(p_sale->>'table_id')::uuid FOR UPDATE;
 IF EXISTS(
  SELECT paid.id FROM jsonb_to_recordset(p_sale->'items') paid(id uuid,price numeric,quantity numeric)
  LEFT JOIN order_items oi ON oi.id=paid.id AND oi.table_id=(p_sale->>'table_id')::uuid
  GROUP BY paid.id,oi.id,oi.quantity,oi.price,oi.is_cancelled,oi.kitchen_status,oi.status
  HAVING oi.id IS NULL OR sum(paid.quantity)>oi.quantity OR bool_or(paid.quantity<=0)
   OR min(paid.price)<>round(oi.price/CASE WHEN p_sale->>'split_mode'='equal' THEN greatest(1,(p_sale->>'split_count')::integer) ELSE 1 END,2)
   OR max(paid.price)<>round(oi.price/CASE WHEN p_sale->>'split_mode'='equal' THEN greatest(1,(p_sale->>'split_count')::integer) ELSE 1 END,2)
   OR coalesce(oi.is_cancelled,false) OR coalesce(oi.kitchen_status,oi.status) IN ('cancelled','archived')
 ) THEN RAISE EXCEPTION 'Order changed before payment. Refresh checkout.'; END IF;

 PERFORM set_config('seoul.referral_actor_name',actor.name,true);
 p_sale:=p_sale || jsonb_build_object('id',gen_random_uuid(),'closed_at',now(),'staff_id',p_actor,'staff_name',actor.name);
 SELECT string_agg(format('%I',k),','),string_agg(format('r.%I',k),',') INTO cols,vals
 FROM jsonb_object_keys(p_sale) k JOIN pg_attribute a ON a.attrelid='public.sales'::regclass AND a.attname=k AND a.attnum>0 AND NOT a.attisdropped;
 EXECUTE format('INSERT INTO public.sales (%s) SELECT %s FROM jsonb_populate_record(NULL::public.sales,$1) r RETURNING id',cols,vals) INTO result USING p_sale;
 IF nullif(p_sale->>'referral_override_reason','') IS NOT NULL THEN
  INSERT INTO referral_audit(business_id,code_id,action,actor_id,actor_name,details) VALUES(p_business,c.id,'discount_override',p_actor,actor.name,jsonb_build_object('saleId',result,'reason',p_sale->>'referral_override_reason','percent',p_sale->>'referral_discount_percent'));
 END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.referral_pay_commission(p_code uuid,p_amount numeric,p_date timestamptz,p_notes text,p_key uuid,p_business uuid,p_actor uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c referral_codes; actor staff; balance numeric; result uuid; prior referral_payouts;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 SELECT * INTO actor FROM staff WHERE id=p_actor AND business_id=p_business AND active AND role IN ('admin','manager','cashier');
 IF NOT FOUND THEN RAISE EXCEPTION 'Manager authorization required'; END IF;
 SELECT * INTO c FROM referral_codes WHERE id=p_code AND business_id=p_business FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Code not found'; END IF;
 SELECT * INTO prior FROM referral_payouts WHERE request_key=p_key;
 IF FOUND THEN
  IF prior.business_id<>p_business OR prior.code_id<>p_code OR prior.amount<>round(p_amount,2) THEN RAISE EXCEPTION 'Payout key conflict'; END IF;
  RETURN prior.id;
 END IF;
 IF p_amount IS NULL OR p_amount<=0 OR p_amount<>round(p_amount,2) OR p_date IS NULL OR p_date>now() THEN RAISE EXCEPTION 'Invalid payout amount or date'; END IF;
 SELECT coalesce((SELECT sum(amount) FROM referral_commissions WHERE code_id=p_code),0)-coalesce((SELECT sum(amount) FROM referral_payouts WHERE code_id=p_code),0) INTO balance;
 IF p_amount>balance THEN RAISE EXCEPTION 'Payout exceeds outstanding commission'; END IF;
 INSERT INTO referral_payouts(business_id,code_id,amount,paid_at,notes,actor_id,actor_name,request_key)
 VALUES(p_business,p_code,p_amount,p_date,left(coalesce(p_notes,''),2000),p_actor,actor.name,p_key) RETURNING id INTO result;
 INSERT INTO referral_audit(business_id,code_id,action,actor_id,actor_name,details) VALUES(p_business,p_code,'payout',p_actor,actor.name,jsonb_build_object('payoutId',result,'amount',p_amount,'notes',p_notes));
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.referral_save_code(p_values jsonb,p_business uuid,p_actor uuid,p_version timestamptz DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor staff; c referral_codes; old_values jsonb; result uuid; v referral_codes;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 SELECT * INTO actor FROM staff WHERE id=p_actor AND business_id=p_business AND active AND role IN ('admin','manager','cashier');
 IF NOT FOUND THEN RAISE EXCEPTION 'Manager authorization required'; END IF;
 v:=jsonb_populate_record(NULL::referral_codes,p_values);
 IF v.id IS NOT NULL THEN
  SELECT * INTO c FROM referral_codes WHERE id=v.id AND business_id=p_business FOR UPDATE;
  IF NOT FOUND OR c.updated_at IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Code changed. Refresh before editing.'; END IF;
  old_values:=to_jsonb(c);
  IF EXISTS(SELECT 1 FROM referral_attributions WHERE code_id=c.id) AND v.partner_name<>c.partner_name THEN RAISE EXCEPTION 'Create a new code to change the partner after reservations are linked.'; END IF;
  UPDATE referral_codes SET code=v.code,partner_name=v.partner_name,partner_contact=coalesce(v.partner_contact,''),active=v.active,
   discount_percent=v.discount_percent,commission_percent=v.commission_percent,min_spend=v.min_spend,
   expires_at=v.expires_at,usage_limit=v.usage_limit,deduct_vouchers=v.deduct_vouchers,
   deduct_other_discounts=v.deduct_other_discounts,exclude_tax=v.exclude_tax,tax_rates=v.tax_rates,updated_at=clock_timestamp()
   WHERE id=c.id RETURNING id INTO result;
 ELSE
  INSERT INTO referral_codes(business_id,code,partner_name,partner_contact,active,discount_percent,commission_percent,min_spend,expires_at,usage_limit,deduct_vouchers,deduct_other_discounts,exclude_tax,tax_rates)
  VALUES(p_business,v.code,v.partner_name,coalesce(v.partner_contact,''),v.active,v.discount_percent,v.commission_percent,v.min_spend,v.expires_at,v.usage_limit,v.deduct_vouchers,v.deduct_other_discounts,v.exclude_tax,v.tax_rates) RETURNING id INTO result;
 END IF;
 INSERT INTO referral_audit(business_id,code_id,action,actor_id,actor_name,details) VALUES(p_business,result,CASE WHEN v.id IS NULL THEN 'code_created' ELSE 'code_updated' END,p_actor,actor.name,jsonb_build_object('before',old_values,'after',p_values));
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.referral_change_reservation(p_reservation uuid,p_code text,p_reason text,p_business uuid,p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor staff; c referral_codes; old_code uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 SELECT * INTO actor FROM staff WHERE id=p_actor AND business_id=p_business AND active AND role IN ('admin','manager','cashier');
 IF NOT FOUND OR length(trim(p_reason))<3 THEN RAISE EXCEPTION 'Manager authorization and reason required'; END IF;
 SELECT referral_code_id INTO old_code FROM reservations WHERE id=p_reservation FOR UPDATE;
 IF old_code IS NOT NULL AND NOT EXISTS(SELECT 1 FROM referral_codes WHERE id=old_code AND business_id=p_business) THEN RAISE EXCEPTION 'Reservation belongs to another business'; END IF;
 IF nullif(trim(p_code),'') IS NOT NULL THEN
  SELECT * INTO c FROM referral_codes WHERE code=upper(trim(p_code)) AND business_id=p_business;
  IF NOT FOUND THEN RAISE EXCEPTION 'Code not found'; END IF;
 END IF;
 PERFORM set_config('seoul.referral_override',p_reason,true);
 UPDATE reservations SET referral_code=nullif(upper(trim(p_code)),''),updated_at=now() WHERE id=p_reservation;
 INSERT INTO referral_audit(business_id,code_id,action,actor_id,actor_name,details) VALUES(p_business,coalesce(c.id,old_code),'reservation_referral_override',p_actor,actor.name,jsonb_build_object('reservationId',p_reservation,'reason',p_reason,'code',p_code));
END $$;

CREATE OR REPLACE FUNCTION public.referral_adjust_sales(p_ids uuid[],p_updates jsonb,p_reason text,p_business uuid,p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor staff; s sales; assignments text; result jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 SELECT * INTO actor FROM staff WHERE id=p_actor AND business_id=p_business AND active AND role IN ('admin','manager','cashier');
 IF NOT FOUND OR length(trim(p_reason))<3 THEN RAISE EXCEPTION 'Manager and reason required'; END IF;
 FOR s IN SELECT * FROM sales WHERE id=ANY(p_ids) FOR UPDATE LOOP
  IF s.referral_snapshot->>'business_id' IS DISTINCT FROM p_business::text THEN RAISE EXCEPTION 'Payment access denied'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM sales WHERE id=ANY(p_ids))<>cardinality(p_ids) THEN RAISE EXCEPTION 'Payment not found'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_updates) k WHERE k NOT IN ('items','subtotal','discount_amount','tip','tip_payment_method','grand_total','payment_method','amount_given','change_due','card_auth_code','card_last4','card_brand','deleted_at')) THEN RAISE EXCEPTION 'Unsupported adjustment'; END IF;
 SELECT string_agg(format('%I=(jsonb_populate_record(NULL::public.sales,$1)).%I',k,k),',') INTO assignments FROM jsonb_object_keys(p_updates) k;
 IF assignments IS NULL THEN RAISE EXCEPTION 'No changes supplied'; END IF;
 PERFORM set_config('seoul.referral_actor_name',actor.name,true);
 EXECUTE format('WITH changed AS (UPDATE public.sales SET %s WHERE id=ANY($2) RETURNING id,deleted_at) SELECT jsonb_agg(to_jsonb(changed)) FROM changed',assignments) INTO result USING p_updates,p_ids;
 INSERT INTO referral_audit(business_id,code_id,action,actor_id,actor_name,details) SELECT DISTINCT p_business,referral_code_id,'financial_adjustment',p_actor,actor.name,jsonb_build_object('ids',p_ids,'reason',p_reason,'changes',p_updates) FROM sales WHERE id=ANY(p_ids);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.referral_adjust_sales(uuid[],jsonb,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.referral_adjust_sales(uuid[],jsonb,text,uuid,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.referral_commit_sale(jsonb,uuid,uuid,timestamptz),public.referral_pay_commission(uuid,numeric,timestamptz,text,uuid,uuid,uuid),public.referral_save_code(jsonb,uuid,uuid,timestamptz),public.referral_change_reservation(uuid,text,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.referral_commit_sale(jsonb,uuid,uuid,timestamptz),public.referral_pay_commission(uuid,numeric,timestamptz,text,uuid,uuid,uuid),public.referral_save_code(jsonb,uuid,uuid,timestamptz),public.referral_change_reservation(uuid,text,text,uuid,uuid) TO service_role;
-- Subscribe only while the dashboard is open; existing reservation/sales realtime covers checkout.
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.referral_codes,public.referral_commissions,public.referral_payouts; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
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
