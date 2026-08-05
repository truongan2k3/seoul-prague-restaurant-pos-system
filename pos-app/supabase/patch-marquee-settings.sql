-- patch-marquee-settings.sql — announcement ticker columns
-- Run once in Supabase → SQL Editor (safe to re-run).

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS marquee_enabled boolean DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS marquee_text text DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS marquee_duration_seconds int DEFAULT 28;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS marquee_font_family text DEFAULT 'arial';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS marquee_end_at timestamptz DEFAULT NULL;

NOTIFY pgrst, 'reload schema';
