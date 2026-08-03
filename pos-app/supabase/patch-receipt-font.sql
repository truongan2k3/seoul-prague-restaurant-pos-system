-- patch-receipt-font.sql — run in Supabase SQL editor

ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_font_size text DEFAULT 'medium';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_font_weight text DEFAULT 'bold';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_font_family text DEFAULT 'consolas';
