-- Run if you skipped full-schema.sql or only ran schema-and-seed.sql
-- Adds optional columns used by the POS app (safe to run multiple times)

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS station text NOT NULL DEFAULT 'kitchen',
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'food',
  ADD COLUMN IF NOT EXISTS sold_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;

ALTER TABLE public.tables
  ADD COLUMN IF NOT EXISTS shape text NOT NULL DEFAULT 'square';

UPDATE public.menu_items SET station = 'bar', item_type = 'drink'
WHERE category = 'Drinks' AND station = 'kitchen';

UPDATE public.menu_items SET station = 'kitchen', item_type = 'food'
WHERE category IN ('Hotpot', 'Meat');

-- Staff security (PIN gate + switch-profile password)
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS require_pin_for_actions boolean NOT NULL DEFAULT false;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS require_switch_password boolean NOT NULL DEFAULT false;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS changelog_popup_enabled boolean DEFAULT false;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS changelog_popup_title text DEFAULT '';

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS changelog_popup_body text DEFAULT '';
