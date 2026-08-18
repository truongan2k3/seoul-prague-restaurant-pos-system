ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS kitchen_print_item_gap_px INT NOT NULL DEFAULT 24;

COMMENT ON COLUMN public.settings.kitchen_print_item_gap_px IS
  'Vertical gap between kitchen ticket items (CSS px / bitmap spacer height).';
