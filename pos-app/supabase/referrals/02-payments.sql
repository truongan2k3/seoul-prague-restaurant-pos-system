-- STEP 2 OF 3: secure payments and payouts
BEGIN;
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


COMMIT;
