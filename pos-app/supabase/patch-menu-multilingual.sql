-- Multilingual menu_items: run in Supabase SQL Editor

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS name_en text,
  ADD COLUMN IF NOT EXISTS name_cz text,
  ADD COLUMN IF NOT EXISTS name_zh text,
  ADD COLUMN IF NOT EXISTS description_en text,
  ADD COLUMN IF NOT EXISTS description_cz text,
  ADD COLUMN IF NOT EXISTS description_zh text,
  ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true;

-- Migrate legacy single-language columns
UPDATE public.menu_items
SET name_en = COALESCE(name_en, name)
WHERE name IS NOT NULL;

UPDATE public.menu_items
SET description_en = COALESCE(description_en, description)
WHERE description IS NOT NULL;

UPDATE public.menu_items
SET is_available = NOT COALESCE(sold_out, false)
WHERE sold_out IS NOT NULL;

UPDATE public.menu_items
SET name_en = 'Untitled item'
WHERE name_en IS NULL OR trim(name_en) = '';

ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_category_check;
