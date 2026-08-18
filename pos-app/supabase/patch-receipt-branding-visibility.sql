ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS receipt_branding_visibility JSONB NOT NULL DEFAULT '{
    "showHeaderTitle": true,
    "showBrandAddress": true,
    "showLegalName": true,
    "showCompanyAddress": true,
    "showIcoDic": true,
    "showPhone": true,
    "showFooter": true
  }'::jsonb;

COMMENT ON COLUMN public.settings.receipt_branding_visibility IS
  'Per-field toggles for receipt header/footer branding lines.';
