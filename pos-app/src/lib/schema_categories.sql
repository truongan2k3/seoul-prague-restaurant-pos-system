-- Menu categories + item ordering (reference schema)
-- Run supabase/patch-categories.sql in Supabase SQL Editor.
-- Note: this app stores menu rows in `menu_items` (not `items`).

-- 1. Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'dish', -- 'dish' or 'drink'
  display_order INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add columns to menu_items (canonical items table)
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

-- Sync legacy sort_order into display_order when empty
UPDATE menu_items
SET display_order = COALESCE(NULLIF(display_order, 0), sort_order, 0)
WHERE display_order IS NULL OR display_order = 0;
