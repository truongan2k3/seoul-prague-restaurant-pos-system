-- Allow "delayed" status on order_items (run in Supabase SQL Editor if KDS delay fails)

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_status_check;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_status_check
  CHECK (status IN ('pending', 'held', 'fired', 'delayed', 'done', 'served'));
