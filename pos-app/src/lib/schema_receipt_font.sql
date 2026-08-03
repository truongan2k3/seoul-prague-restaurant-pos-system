-- Receipt font density / size settings (single-row settings table, id = 1)

ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_font_size text DEFAULT 'medium';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_font_weight text DEFAULT 'bold';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_font_family text DEFAULT 'consolas';

-- Allowed values:
-- receipt_font_size: 'normal' (11px), 'medium' (13px), 'large' (15px)
-- receipt_font_weight: 'normal', 'semibold', 'bold', 'extrabold'
