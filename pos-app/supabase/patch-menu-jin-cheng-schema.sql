-- JIN CHENG menu_items canonical schema
-- Run in Supabase SQL Editor BEFORE seed-menu-jin-cheng.sql

-- Allow menu re-seed without breaking order history
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_menu_item_id_fkey;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_menu_item_id_fkey
  FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE SET NULL;

-- ── Multilingual name & description columns ───────────────────────────────────
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS name_en text,
  ADD COLUMN IF NOT EXISTS name_cz text,
  ADD COLUMN IF NOT EXISTS name_zh text,
  ADD COLUMN IF NOT EXISTS description_en text,
  ADD COLUMN IF NOT EXISTS description_cz text,
  ADD COLUMN IF NOT EXISTS description_zh text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS station text NOT NULL DEFAULT 'kitchen',
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'food',
  ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sold_out boolean NOT NULL DEFAULT false;

-- Migrate legacy columns if present
UPDATE public.menu_items
SET name_en = COALESCE(NULLIF(trim(name_en), ''), name)
WHERE (name_en IS NULL OR trim(name_en) = '') AND name IS NOT NULL;

UPDATE public.menu_items
SET description_en = COALESCE(description_en, description)
WHERE description IS NOT NULL AND description_en IS NULL;

UPDATE public.menu_items
SET is_available = NOT COALESCE(sold_out, false)
WHERE is_available IS DISTINCT FROM (NOT COALESCE(sold_out, false));

UPDATE public.menu_items
SET name_en = 'Untitled item'
WHERE name_en IS NULL OR trim(name_en) = '';

-- Drop old category constraint (Hotpot / Meat / Drinks)
ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_category_check;

-- Routing: Drinks → bar, everything else → kitchen
UPDATE public.menu_items
SET
  station = 'bar',
  item_type = 'drink'
WHERE category ILIKE 'Drinks%';

UPDATE public.menu_items
SET
  station = 'kitchen',
  item_type = 'food'
WHERE category NOT ILIKE 'Drinks%';

-- Keep legacy mirror columns in sync for older queries
UPDATE public.menu_items
SET
  name = name_en,
  description = description_en,
  sold_out = NOT is_available;

-- Optional indexes
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON public.menu_items (category);
CREATE INDEX IF NOT EXISTS idx_menu_items_available ON public.menu_items (is_available);
CREATE INDEX IF NOT EXISTS idx_menu_items_sort ON public.menu_items (sort_order, name_en);

-- Ensure RLS policies allow CRUD (idempotent)
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "menu_items_select" ON public.menu_items;
DROP POLICY IF EXISTS "menu_items_insert" ON public.menu_items;
DROP POLICY IF EXISTS "menu_items_update" ON public.menu_items;
DROP POLICY IF EXISTS "menu_items_delete" ON public.menu_items;

CREATE POLICY "menu_items_select" ON public.menu_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "menu_items_insert" ON public.menu_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "menu_items_update" ON public.menu_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "menu_items_delete" ON public.menu_items FOR DELETE TO anon, authenticated USING (true);
