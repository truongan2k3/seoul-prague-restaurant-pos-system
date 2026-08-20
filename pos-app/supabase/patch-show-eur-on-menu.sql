-- Separate EUR on menu vs checkout totals.
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS show_eur_on_menu boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.settings.show_eur_on_menu IS
  'When true with show_eur_currency, menu tiles show EUR; checkout always uses show_eur_currency.';
