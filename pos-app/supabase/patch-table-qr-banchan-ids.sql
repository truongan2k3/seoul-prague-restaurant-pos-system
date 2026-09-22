-- Table QR: which Banchan options guests can request
-- null = all options from the Banchan option group are enabled.

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS table_qr_enabled_banchan_ids jsonb DEFAULT NULL;
