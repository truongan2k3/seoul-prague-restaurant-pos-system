-- Additive and rerunnable. No payment/settings/certificate rows are changed.
BEGIN;
CREATE OR REPLACE FUNCTION public.eet_manager_unlock_attempt(p_business uuid,p_actor uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM staff WHERE id=p_actor AND business_id=p_business AND active=true AND role IN ('admin','cashier','manager')) THEN
    RAISE EXCEPTION 'EET staff authorization failed';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('eet-manager:'||p_business::text,0));
  IF (SELECT count(*) FROM eet_audit_logs WHERE business_id=p_business AND actor_id=p_actor AND action='manager_unlock_attempt' AND created_at>clock_timestamp()-interval '15 minutes')>=5
    OR (SELECT count(*) FROM eet_audit_logs WHERE business_id=p_business AND action='manager_unlock_attempt' AND created_at>clock_timestamp()-interval '15 minutes')>=30 THEN
    RETURN false;
  END IF;
  INSERT INTO eet_audit_logs(business_id,actor_id,action,details) VALUES(p_business,p_actor,'manager_unlock_attempt','{}');
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.eet_manager_unlock_attempt(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eet_manager_unlock_attempt(uuid,uuid) TO service_role;
-- Allow explicitly authorized managers after the server manager-code gate.
CREATE OR REPLACE FUNCTION public.eet_save_material(p_business uuid,p_actor uuid,p_environment text,p_kind text,p_version integer,p_envelope jsonb,p_metadata jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE previous_version integer; next_version integer; field text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM staff WHERE id=p_actor AND business_id=p_business AND active=true AND role IN ('admin','cashier','manager')) THEN RAISE EXCEPTION 'Active EET administrator required'; END IF;
  IF p_version IS NULL OR p_version<0 THEN RAISE EXCEPTION 'Invalid material version'; END IF;
  FOR field IN SELECT jsonb_object_keys(p_metadata) LOOP
    IF NOT(field=ANY(ARRAY['fingerprint','expiresAt','eic','certificateCount','wsdlSha256','xsdSha256','soapAction','source'])) THEN RAISE EXCEPTION 'Unsupported material metadata'; END IF;
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended('eet-material:'||p_business::text||':'||p_environment||':'||p_kind,0));
  SELECT version INTO previous_version FROM eet_materials WHERE business_id=p_business AND environment=p_environment AND kind=p_kind FOR UPDATE;
  IF coalesce(previous_version,0)<>p_version THEN RAISE EXCEPTION 'EET material changed. Reload before replacing'; END IF;
  next_version:=coalesce(previous_version,0)+1;
  INSERT INTO eet_materials(business_id,environment,kind,envelope,metadata,version,updated_by)
  VALUES(p_business,p_environment,p_kind,p_envelope,p_metadata,next_version,p_actor)
  ON CONFLICT(business_id,environment,kind) DO UPDATE SET envelope=excluded.envelope,metadata=excluded.metadata,
    version=excluded.version,updated_by=excluded.updated_by,updated_at=clock_timestamp();
  INSERT INTO eet_audit_logs(business_id,actor_id,action,details) VALUES(p_business,p_actor,'material_imported',
    jsonb_build_object('environment',p_environment,'kind',p_kind,'version',next_version,'metadata',p_metadata));
  RETURN next_version;
END $$;
COMMIT;
