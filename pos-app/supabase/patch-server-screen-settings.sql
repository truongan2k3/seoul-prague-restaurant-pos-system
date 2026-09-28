-- Server Screen (/kds, /bar) language display settings
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS server_screen_config jsonb;

NOTIFY pgrst, 'reload schema';
