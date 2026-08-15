-- Top blank margin on kitchen tickets (mm) so clip rails do not cover table label.
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS kitchen_print_clip_top_mm INT NOT NULL DEFAULT 20;

COMMENT ON COLUMN public.settings.kitchen_print_clip_top_mm IS
  'Blank margin at top of kitchen/bar tickets in mm (0–40). Default 20.';
