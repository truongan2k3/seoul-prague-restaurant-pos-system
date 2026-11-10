-- Additive. Run in a transaction on a staging clone first. Never rewrites historical sales.
-- Depends on existing businesses/staff/sales/tables and normal POS patches.
BEGIN;

CREATE TABLE public.eet_settings (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id),
  mode text NOT NULL DEFAULT 'disabled' CHECK (mode IN ('disabled','playground','production')),
  submission_control text NOT NULL DEFAULT 'paused' CHECK (submission_control IN ('automatic','paused')),
  business_name text NOT NULL DEFAULT '', establishment_address text NOT NULL DEFAULT '',
  eic text NOT NULL DEFAULT '', unit_id text NOT NULL DEFAULT '', register_id text NOT NULL DEFAULT '',
  tip_policy text NOT NULL DEFAULT 'review_required' CHECK (tip_policy IN ('review_required','business_income','employee_income')),
  capture_environment text CHECK (capture_environment IN ('playground','production')),
  live_reporting_started_at timestamptz,
  last_success_at timestamptz, worker_seen_at timestamptz, worker_error text,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.eet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.eet_settings(business_id),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  environment text NOT NULL CHECK (environment IN ('playground','production')),
  revision integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('sale','correction')),
  parent_id uuid REFERENCES public.eet_transactions(id),
  payment_method text NOT NULL CHECK (payment_method IN ('cash','card')),
  amount numeric(10,2) NOT NULL,
  data jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','retrying','uncertain','accepted','failed','blocked')),
  block_reason text,
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid, lease_until timestamptz,
  acknowledgment jsonb, last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL,
  UNIQUE (sale_id, revision),
  CHECK (status <> 'accepted' OR acknowledgment->>'pok' IS NOT NULL)
);
CREATE INDEX eet_queue_due ON public.eet_transactions(business_id,next_attempt_at) WHERE status IN ('pending','retrying','uncertain');
CREATE INDEX eet_sale_history ON public.eet_transactions(sale_id,revision);

CREATE TABLE public.eet_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.eet_transactions(id),
  business_id uuid NOT NULL REFERENCES public.eet_settings(business_id),
  message_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  attempt_number integer NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  outcome text NOT NULL DEFAULT 'started' CHECK (outcome IN ('started','accepted','rejected','uncertain','blocked')),
  request_sha256 text, response_sha256 text, http_status integer,
  global_transaction_id text, result jsonb,
  UNIQUE (transaction_id, attempt_number)
);

CREATE TABLE public.eet_audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  actor_id uuid, action text NOT NULL,
  transaction_id uuid REFERENCES public.eet_transactions(id),
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX eet_audit_business_time ON public.eet_audit_logs(business_id,created_at DESC);

-- EET permissions are exclusively server mediated. Custom POS cookies are NOT Supabase JWTs.
ALTER TABLE public.eet_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eet_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eet_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.eet_settings,public.eet_transactions,public.eet_attempts,public.eet_audit_logs FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.eet_settings,public.eet_transactions,public.eet_attempts TO service_role;
GRANT SELECT,INSERT ON public.eet_audit_logs TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.eet_audit_logs_id_seq TO service_role;

ALTER TABLE public.sales ADD COLUMN eet_business_id uuid REFERENCES public.businesses(id),
  ADD COLUMN eet_payment_key uuid, ADD COLUMN eet_payment_fingerprint text,
  ADD COLUMN eet_visit_revision integer, ADD COLUMN eet_settlement_payload jsonb;
CREATE UNIQUE INDEX eet_payment_once ON public.sales(eet_payment_key) WHERE eet_payment_key IS NOT NULL;
ALTER TABLE public.tables ADD COLUMN eet_payment_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN eet_settlement_key uuid;

-- Amounts already include the POS's rounding, discounts and voucher credit. Never recalculate
-- the customer's bill here. Voucher classification is held for review, not guessed.
CREATE FUNCTION public.eet_sale_amount(p_sale jsonb,p_tip_policy text) RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
  SELECT round(coalesce((p_sale->>'grand_total')::numeric,
    (p_sale->>'subtotal')::numeric-coalesce((p_sale->>'discount_amount')::numeric,0)+coalesce((p_sale->>'tip')::numeric,0))
    -CASE WHEN p_tip_policy='employee_income' THEN coalesce((p_sale->>'tip')::numeric,0) ELSE 0 END,2)
$$;

CREATE SEQUENCE public.eet_fiscal_sequence;
CREATE FUNCTION public.eet_prague_time(p_time timestamptz) RETURNS text
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
  SELECT to_char(p_time AT TIME ZONE 'Europe/Prague','YYYY-MM-DD"T"HH24:MI:SS')||
    CASE WHEN minutes>=0 THEN '+' ELSE '-' END||lpad((abs(minutes)/60)::text,2,'0')||':'||lpad((abs(minutes)%60)::text,2,'0')
  FROM (SELECT (extract(epoch FROM ((p_time AT TIME ZONE 'Europe/Prague')-(p_time AT TIME ZONE 'UTC')))/60)::integer AS minutes) offset_value
$$;
-- The outbox is written by a DB trigger in the SAME transaction as each sale/adjustment.
-- No HTTP, signing, or certificate operations run in the payment transaction.
CREATE FUNCTION public.eet_capture_sale() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cfg eet_settings; bid uuid; current_amount numeric; previous_amount numeric;
  delta numeric; rev integer; parent uuid; stamp timestamptz; why text; snapshot jsonb;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.eet_business_id IS DISTINCT FROM OLD.eet_business_id OR NEW.eet_payment_key IS DISTINCT FROM OLD.eet_payment_key THEN
      RAISE EXCEPTION 'Fiscal payment identity cannot be changed';
    END IF;
    IF (to_jsonb(NEW)->'grand_total',to_jsonb(NEW)->'tip',to_jsonb(NEW)->'deleted_at',to_jsonb(NEW)->'payment_method',to_jsonb(NEW)->'voucher_discount_amount')
      IS NOT DISTINCT FROM
      (to_jsonb(OLD)->'grand_total',to_jsonb(OLD)->'tip',to_jsonb(OLD)->'deleted_at',to_jsonb(OLD)->'payment_method',to_jsonb(OLD)->'voucher_discount_amount') THEN RETURN NEW; END IF;
  END IF;
  -- This POS has global floor tables rather than tenant-owned tables. Once capture is active,
  -- missing/forged staff ownership must not let a direct legacy anon write evade the outbox.
  IF TG_OP='INSERT' AND NEW.deleted_at IS NOT NULL AND NEW.subtotal=0 AND coalesce(NEW.grand_total,0)=0 AND coalesce(NEW.tip,0)=0 THEN RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM eet_settings WHERE capture_environment IS NOT NULL)
    AND auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'EET capture requires secure checkout/history actions'; END IF;
  SELECT coalesce(NEW.eet_business_id,s.business_id) INTO bid FROM staff s WHERE s.id=NEW.staff_id;
  bid:=coalesce(bid,NEW.eet_business_id);
  IF bid IS NULL THEN
    IF EXISTS(SELECT 1 FROM eet_settings WHERE capture_environment IS NOT NULL) THEN RAISE EXCEPTION 'Fiscal business ownership is required for this payment'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO cfg FROM eet_settings WHERE business_id=bid FOR SHARE;
  IF NOT FOUND OR cfg.capture_environment IS NULL THEN RETURN NEW; END IF;
  -- Once enabled, mutable public POS rows may not fabricate fiscal payments/corrections.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'EET capture requires secure checkout/history actions'; END IF;
  IF TG_OP='INSERT' AND NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF; -- existing cancel-audit snapshots
  current_amount:=CASE WHEN NEW.deleted_at IS NULL THEN eet_sale_amount(to_jsonb(NEW),cfg.tip_policy) ELSE 0 END;
  SELECT id INTO parent FROM eet_transactions WHERE sale_id=NEW.id ORDER BY revision DESC LIMIT 1;
  IF TG_OP='UPDATE' AND parent IS NULL THEN
    -- A historical sale predating enablement is not retroactively reported by an edit.
    INSERT INTO eet_audit_logs(business_id,action,details) VALUES(bid,'historical_sale_adjusted',jsonb_build_object('sale_id',NEW.id));
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' THEN
    -- Sum immutable snapshots instead of applying today's tip policy to yesterday's payment.
    SELECT coalesce(sum(amount),0) INTO previous_amount FROM eet_transactions WHERE sale_id=NEW.id;
  ELSE previous_amount:=0; END IF;
  delta:=current_amount-previous_amount;
  IF delta=0 THEN RETURN NEW; END IF;
  SELECT coalesce(max(revision),0)+1 INTO rev FROM eet_transactions WHERE sale_id=NEW.id;
  stamp:=CASE WHEN TG_OP='INSERT' THEN NEW.closed_at ELSE clock_timestamp() END;
  why:=CASE
    WHEN cfg.eic='' OR cfg.unit_id='' OR cfg.register_id='' THEN 'Business fiscal identity is incomplete'
    WHEN cfg.tip_policy='review_required' AND coalesce(NEW.tip,0)<>0 THEN 'Confirm ownership of tips before reporting'
    WHEN coalesce((to_jsonb(NEW)->>'voucher_discount_amount')::numeric,0)<>0 OR
      (TG_OP='UPDATE' AND coalesce((to_jsonb(OLD)->>'voucher_discount_amount')::numeric,0)<>0)
      THEN 'Voucher classification needs an approved EET mapping'
    ELSE NULL END;
  snapshot:=jsonb_build_object('eic_popl',cfg.eic,'id_jednotky',cfg.unit_id,'id_pokl',cfg.register_id,
    'porad_cis','SP-'||nextval('eet_fiscal_sequence')::text,
    'dat_trzby',eet_prague_time(stamp),
    'celk_trzba',to_char(delta,'FM999999990.00'));
  INSERT INTO eet_transactions(business_id,sale_id,environment,revision,kind,parent_id,payment_method,amount,data,status,block_reason,due_at)
  VALUES(bid,NEW.id,cfg.capture_environment,rev,CASE WHEN TG_OP='INSERT' THEN 'sale' ELSE 'correction' END,
    parent,NEW.payment_method,delta,snapshot,CASE WHEN why IS NULL THEN 'pending' ELSE 'blocked' END,why,stamp+interval '48 hours');
  INSERT INTO eet_audit_logs(business_id,actor_id,action,details)
  VALUES(bid,NEW.staff_id,'payment_captured',jsonb_build_object('sale_id',NEW.id,'revision',rev,'amount',delta,'blocked',why));
  RETURN NEW;
END $$;
CREATE TRIGGER eet_capture_sale AFTER INSERT OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.eet_capture_sale();

-- Serialize payment components, verify the visit and use a durable idempotency key. Settlement
-- retains existing KDS/table logic; the pending key prevents a second payment overtaking it.
CREATE FUNCTION public.eet_commit_sale(p_sale jsonb,p_business_id uuid,p_staff_id uuid,p_key uuid,p_fingerprint text,p_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t tables; existing sales; row_sale sales; payload jsonb; columns_sql text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required'; END IF;
  IF p_key IS NULL OR p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' OR p_revision IS NULL OR p_revision<0 OR jsonb_typeof(p_sale)<>'object' THEN RAISE EXCEPTION 'Valid payment idempotency context required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM staff WHERE id=p_staff_id AND business_id=p_business_id AND active=true) THEN RAISE EXCEPTION 'Staff access denied'; END IF;
  SELECT * INTO t FROM tables WHERE id=(p_sale->>'table_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Table unavailable'; END IF;
  SELECT * INTO existing FROM sales WHERE eet_payment_key=p_key;
  IF FOUND THEN
    IF existing.eet_business_id IS DISTINCT FROM p_business_id OR existing.table_id IS DISTINCT FROM t.id OR existing.eet_payment_fingerprint IS DISTINCT FROM p_fingerprint THEN
      RAISE EXCEPTION 'Payment key conflict. Do not confirm another payment'; END IF;
    RETURN jsonb_build_object('id',existing.id,'replayed',true,'skipSettlement',
      t.occupied_at IS DISTINCT FROM existing.seated_at OR t.eet_payment_revision<>existing.eet_visit_revision+1 OR t.eet_settlement_key IS DISTINCT FROM p_key);
  END IF;
  IF t.status='empty' OR t.payment_status='paid' OR t.occupied_at IS DISTINCT FROM (p_sale->>'seated_at')::timestamptz OR t.eet_payment_revision<>p_revision THEN RAISE EXCEPTION 'Table/payment changed. Refresh checkout'; END IF;
  IF t.eet_settlement_key IS NOT NULL THEN RAISE EXCEPTION 'A recorded payment needs settlement recovery before the next payment'; END IF;
  payload:=p_sale||jsonb_build_object('id',gen_random_uuid(),'closed_at',clock_timestamp(),'eet_business_id',p_business_id,
    'eet_payment_key',p_key,'eet_payment_fingerprint',p_fingerprint,'eet_visit_revision',p_revision,
    'staff_id',p_staff_id,'staff_name',(SELECT name FROM staff WHERE id=p_staff_id));
  -- Only this service-role-only RPC accepts a fully validated server-built sales row.
  SELECT string_agg(format('%I',key),',' ORDER BY key) INTO columns_sql FROM jsonb_object_keys(payload) key;
  EXECUTE format('INSERT INTO public.sales (%s) SELECT %s FROM jsonb_populate_record(NULL::public.sales,$1) RETURNING *',columns_sql,columns_sql)
    INTO row_sale USING payload;
  UPDATE tables SET eet_payment_revision=eet_payment_revision+1,eet_settlement_key=p_key WHERE id=t.id;
  RETURN jsonb_build_object('id',row_sale.id,'replayed',false,'skipSettlement',false);
END $$;

CREATE FUNCTION public.eet_finish_settlement(p_table uuid,p_key uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required'; END IF;
  UPDATE tables SET eet_settlement_key=NULL WHERE id=p_table AND eet_settlement_key=p_key;
END $$;

CREATE FUNCTION public.eet_adjust_sales(p_business uuid,p_actor uuid,p_ids uuid[],p_from timestamptz,p_to timestamptz,p_updates jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE sale sales; payload jsonb; fields text; assignments text; result jsonb:='[]'; key text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required'; END IF;
  IF p_ids IS NULL AND p_from IS NULL THEN RAISE EXCEPTION 'Bounded payment scope required'; END IF;
  FOR key IN SELECT jsonb_object_keys(p_updates) LOOP
    IF NOT (key=ANY(ARRAY['items','subtotal','discount_amount','tip','tip_payment_method','grand_total','payment_method','amount_given','change_due','card_auth_code','card_last4','card_brand','deleted_at'])) THEN RAISE EXCEPTION 'Invalid adjustment field'; END IF;
  END LOOP;
  SELECT string_agg(format('%I',k),','),string_agg(format('%I=r.%I',k,k),',') INTO fields,assignments FROM jsonb_object_keys(p_updates) k;
  FOR sale IN SELECT s.* FROM sales s WHERE s.deleted_at IS NULL
    AND (s.eet_business_id=p_business OR (s.eet_business_id IS NULL AND EXISTS(SELECT 1 FROM staff WHERE id=s.staff_id AND business_id=p_business)))
    AND (p_ids IS NULL OR s.id=ANY(p_ids)) AND (p_from IS NULL OR s.closed_at>=p_from) AND (p_to IS NULL OR s.closed_at<=p_to)
    ORDER BY s.id FOR UPDATE OF s LOOP
      -- Referral adjustment metadata preserves the existing referral audit/commission triggers.
      payload:=p_updates;
      IF sale.referral_code_id IS NOT NULL THEN
        payload:=payload||jsonb_build_object('referral_actor_id',p_actor,'referral_actor_name',(SELECT name FROM staff WHERE id=p_actor),'referral_adjustment_reason','History payment edit / refund via secure EET action');
      END IF;
      SELECT string_agg(format('%I=r.%I',k,k),',') INTO assignments FROM jsonb_object_keys(payload) k;
      EXECUTE format('UPDATE public.sales s SET %s FROM jsonb_populate_record(NULL::public.sales,$1) r WHERE s.id=$2',assignments) USING payload,sale.id;
      result:=result||jsonb_build_array(jsonb_build_object('id',sale.id,'deleted_at',payload->'deleted_at'));
      INSERT INTO eet_audit_logs(business_id,actor_id,action,details) VALUES(p_business,p_actor,'history_payment_adjusted',jsonb_build_object('sale_id',sale.id,'changed_fields',(SELECT jsonb_agg(k) FROM jsonb_object_keys(p_updates) k)));
  END LOOP;
  IF p_ids IS NOT NULL AND jsonb_array_length(result)<>cardinality(p_ids) THEN RAISE EXCEPTION 'Some selected payments are inaccessible or already changed'; END IF;
  RETURN result;
END $$;

CREATE FUNCTION public.eet_save_settings(p_business uuid,p_actor uuid,p_version integer,p_value jsonb,p_confirmation text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old_cfg eet_settings; next_mode text:=p_value->>'mode'; next_control text:=p_value->>'submission_control';
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required'; END IF;
  INSERT INTO eet_settings(business_id) VALUES(p_business) ON CONFLICT DO NOTHING;
  SELECT * INTO old_cfg FROM eet_settings WHERE business_id=p_business FOR UPDATE;
  IF old_cfg.version<>p_version THEN RAISE EXCEPTION 'Settings changed. Reload before saving'; END IF;
  IF next_mode='production' AND old_cfg.mode<>'production' AND p_confirmation IS DISTINCT FROM 'ACTIVATE PRODUCTION' THEN RAISE EXCEPTION 'Production confirmation required'; END IF;
  IF old_cfg.mode='production' AND (next_mode<>'production' OR next_control='paused') AND p_confirmation IS DISTINCT FROM 'STOP LIVE SUBMISSIONS' THEN RAISE EXCEPTION 'Live suspension confirmation required'; END IF;
  IF old_cfg.live_reporting_started_at IS NOT NULL AND next_mode='playground' THEN RAISE EXCEPTION 'Live obligations cannot be moved to Playground'; END IF;
  IF old_cfg.capture_environment IS NOT NULL AND (old_cfg.eic,old_cfg.unit_id,old_cfg.register_id,old_cfg.tip_policy) IS DISTINCT FROM
    (p_value->>'eic',p_value->>'unit_id',p_value->>'register_id',p_value->>'tip_policy') THEN
    RAISE EXCEPTION 'Fiscal identity/tip policy is frozen after capture starts. Use an audited migration'; END IF;
  IF old_cfg.capture_environment IS DISTINCT FROM next_mode AND next_mode<>'disabled' AND EXISTS(
    SELECT 1 FROM eet_transactions WHERE business_id=p_business AND status<>'accepted') THEN RAISE EXCEPTION 'Resolve the existing environment queue before switching environments'; END IF;
  UPDATE eet_settings SET mode=next_mode,submission_control=next_control,
    business_name=p_value->>'business_name',establishment_address=p_value->>'establishment_address',
    eic=p_value->>'eic',unit_id=p_value->>'unit_id',register_id=p_value->>'register_id',tip_policy=p_value->>'tip_policy',
    capture_environment=CASE WHEN next_mode='disabled' THEN old_cfg.capture_environment ELSE next_mode END,
    live_reporting_started_at=CASE WHEN next_mode='production' THEN coalesce(old_cfg.live_reporting_started_at,now()) ELSE old_cfg.live_reporting_started_at END,
    version=version+1,updated_at=clock_timestamp() WHERE business_id=p_business;
  INSERT INTO eet_audit_logs(business_id,actor_id,action,details)
    VALUES(p_business,p_actor,'settings_changed',jsonb_build_object('before',to_jsonb(old_cfg)-'worker_error','after',p_value,'queue_preserved',true));
END $$;

CREATE FUNCTION public.eet_claim(p_business uuid) RETURNS SETOF public.eet_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cfg eet_settings; job eet_transactions;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required'; END IF;
  SELECT * INTO cfg FROM eet_settings WHERE business_id=p_business FOR UPDATE;
  UPDATE eet_settings SET worker_seen_at=clock_timestamp() WHERE business_id=p_business;
  IF cfg.mode='disabled' OR cfg.submission_control='paused' THEN RETURN; END IF;
  UPDATE eet_transactions SET status='uncertain',lease_token=NULL,lease_until=NULL,last_error='Worker lease expired; reconcile by replaying the same Data identity'
    WHERE business_id=p_business AND status='processing' AND lease_until<clock_timestamp();
  SELECT * INTO job FROM eet_transactions t WHERE t.business_id=p_business AND t.environment=cfg.mode
    AND t.status IN ('pending','retrying','uncertain') AND t.next_attempt_at<=clock_timestamp()
    AND (t.parent_id IS NULL OR EXISTS(SELECT 1 FROM eet_transactions p WHERE p.id=t.parent_id AND p.status='accepted'))
    ORDER BY t.created_at,t.id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE eet_transactions SET status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds'
    WHERE id=job.id RETURNING * INTO job;
  RETURN NEXT job;
END $$;

CREATE FUNCTION public.eet_begin_attempt(p_id uuid,p_lease uuid,p_hash text) RETURNS public.eet_attempts
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job eet_transactions; a eet_attempts; cfg eet_settings;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required'; END IF;
  SELECT * INTO job FROM eet_transactions WHERE id=p_id AND lease_token=p_lease AND status='processing' AND lease_until>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Worker lease lost'; END IF;
  SELECT * INTO cfg FROM eet_settings WHERE business_id=job.business_id;
  IF cfg.mode<>job.environment OR cfg.submission_control<>'automatic' THEN RAISE EXCEPTION 'Submissions paused'; END IF;
  UPDATE eet_attempts SET outcome='uncertain',finished_at=clock_timestamp() WHERE transaction_id=p_id AND outcome='started';
  UPDATE eet_transactions SET attempt_count=attempt_count+1 WHERE id=p_id RETURNING * INTO job;
  INSERT INTO eet_attempts(transaction_id,business_id,attempt_number,request_sha256) VALUES(p_id,job.business_id,job.attempt_count,p_hash) RETURNING * INTO a;
  RETURN a;
END $$;

CREATE FUNCTION public.eet_finish_attempt(p_id uuid,p_lease uuid,p_attempt uuid,p_status text,p_result jsonb,p_retry_at timestamptz,p_error text,p_http integer,p_trace text,p_response_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job eet_transactions; a eet_attempts;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required'; END IF;
  IF p_status NOT IN ('accepted','retrying','uncertain','failed','blocked') THEN RAISE EXCEPTION 'Invalid worker outcome'; END IF;
  SELECT * INTO job FROM eet_transactions WHERE id=p_id AND lease_token=p_lease AND status='processing' AND lease_until>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_attempt IS NOT NULL THEN
    SELECT * INTO a FROM eet_attempts WHERE id=p_attempt AND transaction_id=p_id AND outcome='started' FOR UPDATE;
    IF NOT FOUND OR a.attempt_number<>job.attempt_count THEN RAISE EXCEPTION 'Attempt does not belong to this lease'; END IF;
    IF p_status='accepted' AND (p_result->>'messageId' IS DISTINCT FROM a.message_id::text OR
      coalesce((p_result->>'test')::boolean,false) IS DISTINCT FROM (job.environment='playground') OR
      p_result->>'pok' IS NULL OR p_response_hash IS NULL) THEN RAISE EXCEPTION 'Acknowledgment must match its attempt and environment'; END IF;
    UPDATE eet_attempts SET finished_at=clock_timestamp(),outcome=CASE WHEN p_status='accepted' THEN 'accepted' WHEN p_status IN ('failed','retrying') THEN 'rejected' ELSE p_status END,
      result=p_result,http_status=p_http,global_transaction_id=p_trace,response_sha256=p_response_hash WHERE id=p_attempt AND transaction_id=p_id AND outcome='started';
    IF NOT FOUND THEN RAISE EXCEPTION 'Attempt does not belong to this lease'; END IF;
  ELSIF p_status='accepted' THEN RAISE EXCEPTION 'Accepted results require a signed response attempt'; END IF;
  UPDATE eet_transactions SET status=p_status,last_error=p_error,next_attempt_at=coalesce(p_retry_at,now()),
    acknowledgment=CASE WHEN p_status='accepted' THEN p_result ELSE acknowledgment END,
    block_reason=CASE WHEN p_status='blocked' THEN p_error ELSE block_reason END,lease_token=NULL,lease_until=NULL WHERE id=p_id;
  UPDATE eet_settings SET last_success_at=CASE WHEN p_status='accepted' THEN clock_timestamp() ELSE last_success_at END,
    worker_error=CASE WHEN p_status='accepted' THEN NULL ELSE p_error END WHERE business_id=job.business_id;
  INSERT INTO eet_audit_logs(business_id,transaction_id,action,details) VALUES(job.business_id,p_id,'submission_'||p_status,jsonb_build_object('attempt_id',p_attempt,'trace',p_trace,'error',p_error));
  RETURN true;
END $$;

CREATE FUNCTION public.eet_manual_retry(p_business uuid,p_actor uuid,p_id uuid,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required'; END IF;
  IF length(trim(p_reason))<5 THEN RAISE EXCEPTION 'An audit reason is required'; END IF;
  UPDATE eet_transactions SET status='retrying',next_attempt_at=clock_timestamp(),last_error=NULL
    WHERE id=p_id AND business_id=p_business AND (status IN ('failed','uncertain','retrying') OR
      (status='blocked' AND block_reason='Submission configuration/signing unavailable or paused. Review certificate, protocol artifacts, approvals and attempt audit.'));
  IF NOT FOUND THEN RAISE EXCEPTION 'Only failed/uncertain/retrying transactions may be retried. Accepted records are immutable; blocked policy mappings require review'; END IF;
  INSERT INTO eet_audit_logs(business_id,actor_id,transaction_id,action,details) VALUES(p_business,p_actor,p_id,'manual_reconciliation',jsonb_build_object('reason',p_reason,'method','replay immutable Data with new message UUID'));
END $$;

CREATE FUNCTION public.eet_immutable_transaction() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF (NEW.id,NEW.business_id,NEW.sale_id,NEW.environment,NEW.revision,NEW.kind,NEW.parent_id,NEW.amount,NEW.data,NEW.created_at,NEW.due_at)
    IS DISTINCT FROM (OLD.id,OLD.business_id,OLD.sale_id,OLD.environment,OLD.revision,OLD.kind,OLD.parent_id,OLD.amount,OLD.data,OLD.created_at,OLD.due_at)
    OR (OLD.status='accepted' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD)) THEN RAISE EXCEPTION 'Fiscal snapshots and accepted records are immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER eet_immutable_transaction BEFORE UPDATE ON public.eet_transactions FOR EACH ROW EXECUTE FUNCTION public.eet_immutable_transaction();

CREATE FUNCTION public.eet_queue_health(p_business uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT jsonb_build_object('pending',count(*) FILTER(WHERE status<>'accepted'),
    'errors',count(*) FILTER(WHERE status IN ('failed','uncertain','blocked')),
    'overdue',count(*) FILTER(WHERE status<>'accepted' AND due_at<now()),
    'oldest',min(created_at) FILTER(WHERE status<>'accepted')) FROM eet_transactions WHERE business_id=p_business
$$;
CREATE FUNCTION public.eet_filtered_transactions(p_business uuid,p_from timestamptz,p_to timestamptz,p_status text,p_method text,p_search text)
RETURNS SETOF public.eet_transactions LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT * FROM eet_transactions WHERE business_id=p_business AND created_at>=p_from AND created_at<p_to
    AND (p_status IS NULL OR status=p_status) AND (p_method IS NULL OR payment_method=p_method)
    AND (p_search IS NULL OR id::text=p_search OR sale_id::text=p_search OR data->>'porad_cis' ILIKE '%'||p_search||'%')
$$;
CREATE FUNCTION public.eet_dashboard_stats(p_business uuid,p_from timestamptz,p_to timestamptz,p_status text,p_method text,p_search text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT jsonb_build_object('total',count(*),'accepted',count(*) FILTER(WHERE status='accepted'),
    'pending',count(*) FILTER(WHERE status='pending'),'processing',count(*) FILTER(WHERE status='processing'),
    'retrying',count(*) FILTER(WHERE status='retrying'),'uncertain',count(*) FILTER(WHERE status='uncertain'),
    'failed',count(*) FILTER(WHERE status='failed'),'blocked',count(*) FILTER(WHERE status='blocked'),
    'amount',coalesce(sum(amount),0)::text,'overdue',count(*) FILTER(WHERE status<>'accepted' AND due_at<now()))
  FROM eet_filtered_transactions(p_business,p_from,p_to,p_status,p_method,p_search)
$$;
CREATE FUNCTION public.eet_export_rows(p_business uuid,p_from timestamptz,p_to timestamptz,p_status text,p_method text,p_search text,p_offset integer)
RETURNS SETOF public.eet_transactions LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT * FROM eet_filtered_transactions(p_business,p_from,p_to,p_status,p_method,p_search) ORDER BY created_at,id OFFSET greatest(p_offset,0) LIMIT 500
$$;

-- Restrict every callable function, including SECURITY DEFINER routines.
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'eet_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
