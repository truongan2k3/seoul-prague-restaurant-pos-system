-- Multi-printer + silent print bridge settings
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS silent_print_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS print_bridge_url TEXT NOT NULL DEFAULT 'http://127.0.0.1:39100',
  ADD COLUMN IF NOT EXISTS browser_print_fallback BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS printers JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.settings.silent_print_enabled IS
  'Send jobs to local print bridge (no browser print dialog)';
COMMENT ON COLUMN public.settings.print_bridge_url IS
  'Local print bridge base URL, e.g. http://127.0.0.1:39100';
COMMENT ON COLUMN public.settings.browser_print_fallback IS
  'If silent print fails, fall back to browser print dialog';
COMMENT ON COLUMN public.settings.printers IS
  'JSON array of { id, name, host, port, enabled, roles: receipt|kitchen|kitchen-message|bar }';
