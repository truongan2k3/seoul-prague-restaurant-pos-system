BEGIN;
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
COMMIT;
