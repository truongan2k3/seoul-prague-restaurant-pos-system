-- Categories table + menu_items ordering / FK
-- Run AFTER patch-menu-jin-cheng-schema.sql

-- ── Categories ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'dish' CHECK (type IN ('dish', 'drink')),
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name ON public.categories (lower(trim(name)));

-- ── menu_items extensions ───────────────────────────────────────────────────
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;

UPDATE public.menu_items
SET display_order = COALESCE(NULLIF(display_order, 0), sort_order, 0)
WHERE display_order IS NULL OR display_order = 0;

UPDATE public.menu_items mi
SET sort_order = mi.display_order
WHERE mi.sort_order IS DISTINCT FROM mi.display_order;

CREATE INDEX IF NOT EXISTS idx_menu_items_display_order ON public.menu_items (display_order, name_en);
CREATE INDEX IF NOT EXISTS idx_menu_items_category_id ON public.menu_items (category_id);

-- ── Seed categories from existing menu_items.category text ──────────────────
INSERT INTO public.categories (name, type, display_order)
SELECT DISTINCT ON (lower(trim(category)))
  trim(category) AS name,
  CASE WHEN trim(category) ILIKE 'Drinks%' THEN 'drink' ELSE 'dish' END AS type,
  ROW_NUMBER() OVER (
    ORDER BY
      CASE WHEN trim(category) ILIKE 'Drinks%' THEN 1 ELSE 0 END,
      trim(category)
  ) - 1 AS display_order
FROM public.menu_items
WHERE trim(category) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.categories c
    WHERE lower(trim(c.name)) = lower(trim(menu_items.category))
  );

-- Link menu_items to seeded categories by name
UPDATE public.menu_items mi
SET category_id = c.id
FROM public.categories c
WHERE mi.category_id IS NULL
  AND lower(trim(mi.category)) = lower(trim(c.name));

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_select" ON public.categories;
DROP POLICY IF EXISTS "categories_insert" ON public.categories;
DROP POLICY IF EXISTS "categories_update" ON public.categories;
DROP POLICY IF EXISTS "categories_delete" ON public.categories;

CREATE POLICY "categories_select" ON public.categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "categories_insert" ON public.categories FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "categories_update" ON public.categories FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "categories_delete" ON public.categories FOR DELETE TO anon, authenticated USING (true);

-- ── Realtime (optional) ───────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
