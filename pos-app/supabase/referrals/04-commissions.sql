BEGIN;
CREATE OR REPLACE FUNCTION public.referral_product_subtotal(p_items jsonb,p_split_mode text,p_split_count integer)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $products$
 SELECT round(sum(greatest(0,coalesce(
  nullif(j->>'commissionUnitPrice','')::numeric,
  coalesce(nullif(j->>'originalPrice','')::numeric,nullif(j->'modifiers'->>'originalUnitPrice','')::numeric)
   /CASE WHEN p_split_mode='equal' THEN greatest(1,coalesce(p_split_count,1)) ELSE 1 END,
  nullif(j->>'price','')::numeric,0)) * greatest(0,nullif(j->>'quantity','')::numeric)),2)
 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_items)='array' THEN p_items ELSE '[]'::jsonb END) j;
$products$;

CREATE OR REPLACE FUNCTION public.referral_record_commission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $commission$
DECLARE rules jsonb; base numeric:=0; target numeric:=0; previous numeric:=0;
 previous_base numeric:=0; previous_gross numeric:=0; previous_discount numeric:=0;
 gross numeric:=0; discount numeric:=0;
BEGIN
 IF NEW.referral_code_id IS NULL THEN RETURN NEW; END IF;
 SELECT coalesce((SELECT l.rules FROM referral_commissions l WHERE l.sale_id=NEW.id AND l.kind='earned' LIMIT 1),a.rules)
  || NEW.referral_snapshot || jsonb_build_object('commission_basis','original_product_prices','commission_percent',10,
   'exclude_tax',false,'deduct_vouchers',false,'deduct_other_discounts',false,'applied_discount_percent',NEW.referral_discount_percent)
 INTO rules FROM referral_attributions a WHERE a.reservation_id=NEW.reservation_id;
 -- Discounts are recorded for reporting only, never used to calculate commission.
 IF NEW.deleted_at IS NULL THEN gross:=NEW.subtotal; discount:=NEW.referral_discount_amount; END IF;
 IF NEW.deleted_at IS NULL AND coalesce((rules->>'eligible')::boolean,false) THEN
  base:=greatest(0,coalesce(public.referral_product_subtotal(NEW.items,NEW.split_mode,NEW.split_count),NEW.subtotal,0));
  target:=round(base*0.10,2);
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
COMMIT;
