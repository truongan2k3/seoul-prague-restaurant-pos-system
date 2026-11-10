-- Run after 202611100001_eet_integration.sql. Additive; no existing payments/settings changed.
BEGIN;
CREATE TABLE public.eet_materials (
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  environment text NOT NULL CHECK (environment IN ('shared','playground','production')),
  kind text NOT NULL CHECK (kind IN ('protocol','signer','response')),
  envelope jsonb NOT NULL CHECK (jsonb_typeof(envelope)='object' AND envelope->>'v'='1' AND envelope ?& ARRAY['keyId','iv','tag','ciphertext'] AND length(envelope->>'ciphertext')<=360000),
  metadata jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata)='object'),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id,environment,kind),
  CHECK ((kind='protocol' AND environment='shared') OR (kind IN ('signer','response') AND environment IN ('playground','production')))
);
ALTER TABLE public.eet_materials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.eet_materials FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.eet_materials TO service_role;

CREATE FUNCTION public.eet_save_material(p_business uuid,p_actor uuid,p_environment text,p_kind text,p_version integer,p_envelope jsonb,p_metadata jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE previous_version integer; next_version integer; field text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM staff WHERE id=p_actor AND business_id=p_business AND active=true AND role IN ('admin','cashier')) THEN RAISE EXCEPTION 'Active EET administrator required'; END IF;
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
REVOKE ALL ON FUNCTION public.eet_save_material(uuid,uuid,text,text,integer,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eet_save_material(uuid,uuid,text,text,integer,jsonb,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
