-- patch-business-auth.sql — run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.business_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  username text NOT NULL,
  password_hash text NOT NULL,
  password_salt text NOT NULL,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'manager', 'staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, username)
);

CREATE UNIQUE INDEX IF NOT EXISTS business_accounts_username_lower_idx
  ON public.business_accounts (lower(username));

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id);

CREATE UNIQUE INDEX IF NOT EXISTS settings_business_id_unique
  ON public.settings (business_id)
  WHERE business_id IS NOT NULL;

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "businesses_anon_all" ON public.businesses;
CREATE POLICY "businesses_anon_all" ON public.businesses
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "business_accounts_anon_all" ON public.business_accounts;
CREATE POLICY "business_accounts_anon_all" ON public.business_accounts
  FOR ALL USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('business_branding', 'business_branding', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "business_branding_public_read" ON storage.objects;
CREATE POLICY "business_branding_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'business_branding');

DROP POLICY IF EXISTS "business_branding_anon_upload" ON storage.objects;
CREATE POLICY "business_branding_anon_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'business_branding');

DROP POLICY IF EXISTS "business_branding_anon_update" ON storage.objects;
CREATE POLICY "business_branding_anon_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'business_branding');

NOTIFY pgrst, 'reload schema';
