-- patch-menu-item-layout.sql — run in Supabase SQL editor

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS menu_item_layout TEXT DEFAULT 'vertical';

COMMENT ON COLUMN settings.menu_item_layout IS 'Order screen menu tiles: vertical (image above) or horizontal (image + name on one row)';
