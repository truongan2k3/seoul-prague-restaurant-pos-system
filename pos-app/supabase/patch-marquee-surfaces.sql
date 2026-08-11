-- Marquee surfaces: POS / client / KDS / bar
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS marquee_on_pos boolean DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS marquee_on_client boolean DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS marquee_on_kds boolean DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS marquee_on_bar boolean DEFAULT false;

NOTIFY pgrst, 'reload schema';
