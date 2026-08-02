-- Optimized schema + full CRUD policies for menu & inventory
-- Safe to run multiple times in Supabase SQL Editor

-- ── Menu items: timestamps + indexes ─────────────────────────────────────────

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS station text NOT NULL DEFAULT 'kitchen',
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'food',
  ADD COLUMN IF NOT EXISTS sold_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_menu_items_category ON public.menu_items (category);
CREATE INDEX IF NOT EXISTS idx_menu_items_sort ON public.menu_items (sort_order, name);
CREATE INDEX IF NOT EXISTS idx_menu_items_sold_out ON public.menu_items (sold_out) WHERE sold_out = true;

-- ── Inventory: timestamps + indexes ───────────────────────────────────────────

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_inventory_category ON public.inventory_items (category);

-- ── Order items indexes (query KDS/Bar faster) ────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_order_items_station_status ON public.order_items (station, status);
CREATE INDEX IF NOT EXISTS idx_order_items_table ON public.order_items (table_id);

-- ── Sales index ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sales_closed_at ON public.sales (closed_at DESC);

-- ── Auto-update updated_at ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS menu_items_updated_at ON public.menu_items;
CREATE TRIGGER menu_items_updated_at
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS inventory_items_updated_at ON public.inventory_items;
CREATE TRIGGER inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS: full CRUD for menu_items & inventory ─────────────────────────────────

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read on menu_items" ON public.menu_items;
DROP POLICY IF EXISTS "menu_items_select" ON public.menu_items;
DROP POLICY IF EXISTS "menu_items_insert" ON public.menu_items;
DROP POLICY IF EXISTS "menu_items_update" ON public.menu_items;
DROP POLICY IF EXISTS "menu_items_delete" ON public.menu_items;
DROP POLICY IF EXISTS "menu_items_all" ON public.menu_items;

CREATE POLICY "menu_items_select" ON public.menu_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "menu_items_insert" ON public.menu_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "menu_items_update" ON public.menu_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "menu_items_delete" ON public.menu_items FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "inventory_all" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_select" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_insert" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_update" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_delete" ON public.inventory_items;

CREATE POLICY "inventory_select" ON public.inventory_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "inventory_insert" ON public.inventory_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "inventory_update" ON public.inventory_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "inventory_delete" ON public.inventory_items FOR DELETE TO anon, authenticated USING (true);

-- Sync routing from category
UPDATE public.menu_items SET station = 'bar', item_type = 'drink' WHERE category = 'Drinks';
UPDATE public.menu_items SET station = 'kitchen', item_type = 'food' WHERE category IN ('Hotpot', 'Meat');

-- Realtime (ignore error if already added)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_items;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
