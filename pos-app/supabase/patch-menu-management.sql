-- Menu Management fields: run in Supabase SQL Editor

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS description text;

-- Allow custom categories beyond Hotpot / Meat / Drinks
ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_category_check;
