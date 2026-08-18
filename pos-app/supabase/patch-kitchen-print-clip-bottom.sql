-- Bottom blank margin on kitchen tickets (mm) before auto-cut.
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS kitchen_print_clip_bottom_mm INT NOT NULL DEFAULT 8;

COMMENT ON COLUMN public.settings.kitchen_print_clip_bottom_mm IS
  'Blank margin at bottom of kitchen/bar tickets in mm (0–40). Default 8.';
