-- Phase 1: order_logs + 4-step order item workflow
-- Run manually in Supabase SQL Editor (safe to re-run)

-- ── order_logs ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.order_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  action text NOT NULL,
  staff_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_logs_order_id_idx ON public.order_logs(order_id);
CREATE INDEX IF NOT EXISTS order_logs_created_at_idx ON public.order_logs(created_at DESC);

ALTER TABLE public.order_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_logs_all" ON public.order_logs;
CREATE POLICY "order_logs_all" ON public.order_logs
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ── Migrate order_items to 4-step workflow ───────────────────────────────────
-- Pending (ordered) -> Preparing -> Ready -> Served

-- 1) Drop the old check FIRST (legacy values: fired, delayed, done — not preparing/ready)
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_status_check;

-- 2) Allow both legacy + new values during migration
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_status_check
  CHECK (status IN (
    'pending', 'held',
    'preparing', 'ready', 'served',
    'fired', 'delayed', 'done'
  ));

-- 3) Migrate data to new workflow labels
UPDATE public.order_items SET status = 'pending' WHERE status IN ('fired', 'pending');
UPDATE public.order_items SET status = 'preparing' WHERE status = 'delayed';
UPDATE public.order_items SET status = 'ready' WHERE status = 'done';

-- 4) Tighten constraint to final 4-step workflow (+ held)
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_status_check;

ALTER TABLE public.order_items
  ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_status_check
  CHECK (status IN ('pending', 'held', 'preparing', 'ready', 'served'));

-- ── Phase 3: Realtime on order_logs (optional, for future listeners) ─────────
-- Safe to re-run; ignore error if already in publication.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.order_logs;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
