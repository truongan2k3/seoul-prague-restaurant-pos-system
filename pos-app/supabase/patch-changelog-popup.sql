-- Changelog popup shown on POS refresh (admin-configurable).
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS changelog_popup_enabled boolean DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS changelog_popup_title text DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS changelog_popup_body text DEFAULT '';

COMMENT ON COLUMN public.settings.changelog_popup_enabled IS 'Show changelog modal on each POS page load when enabled.';
COMMENT ON COLUMN public.settings.changelog_popup_title IS 'Changelog modal title.';
COMMENT ON COLUMN public.settings.changelog_popup_body IS 'Changelog modal body (plain text, line breaks preserved).';
