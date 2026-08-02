-- Smart waiter note translation (run in Supabase SQL Editor)

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS notes_translated text;
