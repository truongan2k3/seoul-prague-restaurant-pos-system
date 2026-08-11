-- Kitchen ticket print settings
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS kitchen_print_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS kitchen_print_primary_lang TEXT NOT NULL DEFAULT 'zh',
  ADD COLUMN IF NOT EXISTS kitchen_print_secondary_lang TEXT NOT NULL DEFAULT 'en';

COMMENT ON COLUMN public.settings.kitchen_print_enabled IS
  'Print kitchen ticket when staff sends order / kitchen message';
COMMENT ON COLUMN public.settings.kitchen_print_primary_lang IS
  'Large language on kitchen ticket: zh | en | cs';
COMMENT ON COLUMN public.settings.kitchen_print_secondary_lang IS
  'Small language under primary: zh | en | cs | none';
