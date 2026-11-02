ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS sidebar_nav_order jsonb NOT NULL DEFAULT '[]'::jsonb;
NOTIFY pgrst, 'reload schema';
