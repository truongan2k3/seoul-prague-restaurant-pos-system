BEGIN;
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
COMMIT;
