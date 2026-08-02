-- Order modal fields: run in Supabase SQL Editor

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS is_printed_note boolean NOT NULL DEFAULT false;

-- Allow "delayed" status (skip if already applied)
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_status_check;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_status_check
  CHECK (status IN ('pending', 'held', 'fired', 'delayed', 'done', 'served'));
