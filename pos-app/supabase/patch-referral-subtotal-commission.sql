-- Run this entire file in Supabase SQL Editor.
-- Commission = 10% x sum(original product unit price x paid quantity).
-- Existing earnings are corrected with append-only, idempotent adjustments.
-- Older receipts without an original-price snapshot use their saved item prices.
BEGIN;
LOCK TABLE public.sales,public.referral_commissions IN SHARE ROW EXCLUSIVE MODE;
CREATE OR REPLACE FUNCTION public.referral_product_subtotal(p_items jsonb,p_split_mode text,p_split_count integer)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $products$
 SELECT round(coalesce(sum(greatest(0,coalesce(
  (j->>'commissionUnitPrice')::numeric,
  coalesce((j->>'originalPrice')::numeric,(j->'modifiers'->>'originalUnitPrice')::numeric)
   /CASE WHEN p_split_mode='equal' THEN greatest(1,coalesce(p_split_count,1)) ELSE 1 END,
  (j->>'price')::numeric,0)) * greatest(0,(j->>'quantity')::numeric)),0),2)
 FROM jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) j;
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
  base:=public.referral_product_subtotal(NEW.items,NEW.split_mode,NEW.split_count);
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

-- Correct existing earnings by appending only the difference; reruns do not duplicate earnings.
WITH targets AS (
 SELECT s.id,s.referral_code_id,e.business_id,e.reservation_id,
  CASE WHEN s.deleted_at IS NULL AND coalesce((s.referral_snapshot->>'eligible')::boolean,false)
   THEN public.referral_product_subtotal(s.items,s.split_mode,s.split_count) ELSE 0 END AS base,
  e.rules || coalesce(s.referral_snapshot,'{}'::jsonb) || jsonb_build_object('commission_basis','original_product_prices',
   'commission_percent',10,'exclude_tax',false,'deduct_vouchers',false,'deduct_other_discounts',false) AS rules,
  (SELECT coalesce(sum(l.amount),0) FROM public.referral_commissions l WHERE l.sale_id=s.id) AS previous,
  (SELECT coalesce(sum(l.eligible_amount),0) FROM public.referral_commissions l WHERE l.sale_id=s.id) AS previous_base
 FROM public.sales s JOIN public.referral_commissions e ON e.sale_id=s.id AND e.kind='earned'
), corrections AS (
 INSERT INTO public.referral_commissions(business_id,code_id,sale_id,reservation_id,kind,amount,eligible_amount,gross_amount,discount_amount,rules,reason)
 SELECT business_id,referral_code_id,id,reservation_id,'adjustment',round(base*0.10,2)-previous,base-previous_base,0,0,rules,
  'Corrected commission: 10% of original product prices; discounts, tips and VAT deductions excluded'
 FROM targets WHERE round(base*0.10,2)<>previous OR base<>previous_base
 RETURNING business_id,code_id,sale_id,amount
)
INSERT INTO public.referral_audit(business_id,code_id,action,actor_name,details)
SELECT business_id,code_id,'commission_formula_corrected','SQL migration',jsonb_build_object('saleId',sale_id,'delta',amount,'commissionPercent',10)
FROM corrections;

WITH changed AS (
 UPDATE public.referral_codes SET commission_percent=10,exclude_tax=false,deduct_other_discounts=false,deduct_vouchers=false,updated_at=now()
 WHERE commission_percent<>10 OR exclude_tax OR deduct_other_discounts OR deduct_vouchers RETURNING id,business_id
)
INSERT INTO public.referral_audit(business_id,code_id,action,actor_name,details)
SELECT business_id,id,'commission_policy_changed','SQL migration',jsonb_build_object('commissionPercent',10,'basis','original_product_prices') FROM changed;
COMMIT;
