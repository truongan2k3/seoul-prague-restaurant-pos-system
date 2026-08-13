-- Kitchen fulfillment: screen (KDS/bar), paper (print only), or both.
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS kitchen_fulfillment_mode text NOT NULL DEFAULT 'both';

ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_kitchen_fulfillment_mode_check;
ALTER TABLE public.settings
  ADD CONSTRAINT settings_kitchen_fulfillment_mode_check
  CHECK (kitchen_fulfillment_mode IN ('both', 'screen', 'paper'));

COMMENT ON COLUMN public.settings.kitchen_fulfillment_mode IS
  'both = KDS/bar + print on Send; screen = KDS/bar only; paper = print on Send, auto-done, no KDS/bar';
