-- Reusable option-group catalog for menu customization
-- Run in Supabase SQL Editor after patch-lunch-menu-customization.sql
--
-- Menu items keep referencing library groups via
-- customization_config.optionGroupLibraryIds (jsonb on menu_items).
-- At load time the app resolves those IDs into embedded optionGroups
-- so order / print / customize flows stay unchanged.
-- Legacy items with only inline optionGroups continue to work.

CREATE TABLE IF NOT EXISTS public.option_group_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en TEXT NOT NULL,
  name_cz TEXT,
  name_zh TEXT,
  required BOOLEAN NOT NULL DEFAULT true,
  multi BOOLEAN NOT NULL DEFAULT false,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  display_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_option_group_library_display_order
  ON public.option_group_library (display_order, name_en);

CREATE INDEX IF NOT EXISTS idx_option_group_library_active
  ON public.option_group_library (active)
  WHERE active = true;

ALTER TABLE public.option_group_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "option_group_library_select" ON public.option_group_library;
DROP POLICY IF EXISTS "option_group_library_insert" ON public.option_group_library;
DROP POLICY IF EXISTS "option_group_library_update" ON public.option_group_library;
DROP POLICY IF EXISTS "option_group_library_delete" ON public.option_group_library;

CREATE POLICY "option_group_library_select"
  ON public.option_group_library FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "option_group_library_insert"
  ON public.option_group_library FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "option_group_library_update"
  ON public.option_group_library FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "option_group_library_delete"
  ON public.option_group_library FOR DELETE TO anon, authenticated USING (true);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.option_group_library;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
