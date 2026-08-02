-- Snapshot order_logs onto sales before checkout deletes order_items (CASCADE).
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS activity_log jsonb NOT NULL DEFAULT '[]'::jsonb;
