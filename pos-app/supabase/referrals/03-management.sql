-- STEP 3 OF 3: management, permissions and reporting
BEGIN;
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
