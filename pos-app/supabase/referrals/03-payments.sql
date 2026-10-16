BEGIN;
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
COMMIT;
