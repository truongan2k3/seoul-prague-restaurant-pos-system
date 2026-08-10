-- Order Flow / Auto-Serve / Pre-payment / Add-on Pricing
-- Run in Supabase SQL Editor after existing patches.
--
-- NOTE: This POS has no `orders` table — open tickets are `order_items`
-- keyed by `table_id`. payment_status + fulfillment_status live on `tables`.

-- 1. Categories drag-and-drop sort (idempotent; already present in patch-categories)
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;

-- 2. Pre-payment + fulfillment tracking on open table tickets
ALTER TABLE public.tables
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS fulfillment_status TEXT NOT NULL DEFAULT 'in_progress';

ALTER TABLE public.tables DROP CONSTRAINT IF EXISTS tables_payment_status_check;
ALTER TABLE public.tables
  ADD CONSTRAINT tables_payment_status_check
  CHECK (payment_status IN ('unpaid', 'paid'));

ALTER TABLE public.tables DROP CONSTRAINT IF EXISTS tables_fulfillment_status_check;
ALTER TABLE public.tables
  ADD CONSTRAINT tables_fulfillment_status_check
  CHECK (fulfillment_status IN ('in_progress', 'completed'));

-- Reset empty tables to clean defaults
UPDATE public.tables
SET
  payment_status = 'unpaid',
  fulfillment_status = 'in_progress'
WHERE status = 'empty';

-- 3. Kitchen auto-serve timer + selected add-ons on order lines
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS kitchen_status TEXT,
  ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS selected_addons JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill kitchen_status from legacy `status` (app uses pending/preparing/ready/served)
UPDATE public.order_items
SET kitchen_status = CASE
  WHEN status IN ('done', 'ready') THEN 'ready'
  WHEN status = 'served' THEN 'served'
  ELSE 'pending'
END
WHERE kitchen_status IS NULL;

ALTER TABLE public.order_items
  ALTER COLUMN kitchen_status SET DEFAULT 'pending';

UPDATE public.order_items
SET kitchen_status = 'pending'
WHERE kitchen_status IS NULL;

ALTER TABLE public.order_items
  ALTER COLUMN kitchen_status SET NOT NULL;

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_kitchen_status_check;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_kitchen_status_check
  CHECK (kitchen_status IN ('pending', 'ready', 'served'));

CREATE INDEX IF NOT EXISTS idx_order_items_kitchen_status
  ON public.order_items (kitchen_status);

CREATE INDEX IF NOT EXISTS idx_order_items_ready_at
  ON public.order_items (ready_at)
  WHERE ready_at IS NOT NULL;

-- 4. Special requests / add-ons linked to menu items
CREATE TABLE IF NOT EXISTS public.menu_item_addons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  addons JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_required BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_item_addons_item_id
  ON public.menu_item_addons (item_id);

ALTER TABLE public.menu_item_addons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "menu_item_addons_select" ON public.menu_item_addons;
DROP POLICY IF EXISTS "menu_item_addons_insert" ON public.menu_item_addons;
DROP POLICY IF EXISTS "menu_item_addons_update" ON public.menu_item_addons;
DROP POLICY IF EXISTS "menu_item_addons_delete" ON public.menu_item_addons;

CREATE POLICY "menu_item_addons_select"
  ON public.menu_item_addons FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "menu_item_addons_insert"
  ON public.menu_item_addons FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "menu_item_addons_update"
  ON public.menu_item_addons FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "menu_item_addons_delete"
  ON public.menu_item_addons FOR DELETE TO anon, authenticated USING (true);

-- Optional realtime for addon editor / POS sync
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_item_addons;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
