-- Kitchen ticket print settings
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS kitchen_print_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS kitchen_print_primary_lang TEXT NOT NULL DEFAULT 'zh',
  ADD COLUMN IF NOT EXISTS kitchen_print_secondary_lang TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS kitchen_print_order_font_size TEXT NOT NULL DEFAULT 'large',
  ADD COLUMN IF NOT EXISTS kitchen_print_message_font_size TEXT NOT NULL DEFAULT 'large';

COMMENT ON COLUMN public.settings.kitchen_print_enabled IS
  'Print kitchen ticket when staff sends order / kitchen message';
COMMENT ON COLUMN public.settings.kitchen_print_primary_lang IS
  'Large language on kitchen ticket: zh | en | cs';
COMMENT ON COLUMN public.settings.kitchen_print_secondary_lang IS
  'Small language under primary: zh | en | cs | none';
COMMENT ON COLUMN public.settings.kitchen_print_order_font_size IS
  'Kitchen order ticket text size: normal | large | xlarge';
COMMENT ON COLUMN public.settings.kitchen_print_message_font_size IS
  'Kitchen staff message ticket text size: normal | large | xlarge';
