-- patch-kitchen-print-font-weight.sql — run in Supabase SQL editor

ALTER TABLE settings ADD COLUMN IF NOT EXISTS kitchen_print_order_font_weight text DEFAULT 'bold';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS kitchen_print_message_font_weight text DEFAULT 'bold';
