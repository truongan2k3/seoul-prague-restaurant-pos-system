-- Full POS schema migration
-- Run AFTER schema-and-seed.sql (or replaces it for fresh install)

-- ── Staff ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('cashier', 'server', 'kitchen', 'bar', 'manager')),
  pin text
);

INSERT INTO public.staff (id, name, role, pin) VALUES
  ('30000000-0000-4000-a000-000000000001'::uuid, 'Andy', 'cashier', NULL),
  ('30000000-0000-4000-a000-000000000002'::uuid, 'Lily', 'server', NULL),
  ('30000000-0000-4000-a000-000000000003'::uuid, 'Adele', 'server', NULL),
  ('30000000-0000-4000-a000-000000000004'::uuid, 'UK', 'server', NULL),
  ('30000000-0000-4000-a000-000000000005'::uuid, 'Jennie', 'server', NULL),
  ('30000000-0000-4000-a000-000000000006'::uuid, 'Master Liu', 'manager', '1234')
ON CONFLICT (id) DO NOTHING;

-- ── Extend menu_items ─────────────────────────────────────────────────────────

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS station text NOT NULL DEFAULT 'kitchen'
    CHECK (station IN ('kitchen', 'bar')),
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'food'
    CHECK (item_type IN ('food', 'drink')),
  ADD COLUMN IF NOT EXISTS sold_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS name_en text,
  ADD COLUMN IF NOT EXISTS name_cz text,
  ADD COLUMN IF NOT EXISTS name_zh text,
  ADD COLUMN IF NOT EXISTS description_en text,
  ADD COLUMN IF NOT EXISTS description_cz text,
  ADD COLUMN IF NOT EXISTS description_zh text;

UPDATE public.menu_items SET station = 'bar', item_type = 'drink'
WHERE category ILIKE 'Drinks%';

UPDATE public.menu_items SET station = 'kitchen', item_type = 'food'
WHERE category NOT ILIKE 'Drinks%';

UPDATE public.menu_items SET name_en = COALESCE(name_en, name) WHERE name IS NOT NULL;
UPDATE public.menu_items SET is_available = NOT COALESCE(sold_out, false);

-- ── Extend tables ───────────────────────────────────────────────────────────

ALTER TABLE public.tables
  ADD COLUMN IF NOT EXISTS shape text NOT NULL DEFAULT 'square'
    CHECK (shape IN ('square', 'round')),
  ADD COLUMN IF NOT EXISTS pos_x numeric,
  ADD COLUMN IF NOT EXISTS pos_y numeric;

ALTER TABLE public.tables DROP CONSTRAINT IF EXISTS tables_status_check;
ALTER TABLE public.tables ADD CONSTRAINT tables_status_check
  CHECK (status IN ('empty', 'waiting', 'ready', 'occupied'));

UPDATE public.tables SET status = 'waiting' WHERE status = 'occupied';

-- ── Order items (real-time kitchen/bar routing) ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES public.menu_items(id),
  staff_id uuid REFERENCES public.staff(id),
  name text NOT NULL,
  price numeric(10, 2) NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  notes text,
  is_printed_note boolean NOT NULL DEFAULT false,
  station text NOT NULL CHECK (station IN ('kitchen', 'bar')),
  status text NOT NULL DEFAULT 'fired'
    CHECK (status IN ('pending', 'held', 'fired', 'delayed', 'done', 'served')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Sales (for Summary / Z-Report) ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid REFERENCES public.tables(id),
  table_label text,
  staff_id uuid REFERENCES public.staff(id),
  staff_name text,
  subtotal numeric(10, 2) NOT NULL,
  discount_amount numeric(10, 2) NOT NULL DEFAULT 0,
  discount_type text CHECK (discount_type IN ('percent', 'fixed')),
  discount_value numeric(10, 2) DEFAULT 0,
  tip numeric(10, 2) NOT NULL DEFAULT 0,
  grand_total numeric(10, 2),
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'card')),
  amount_given numeric(10, 2),
  change_due numeric(10, 2),
  split_mode text CHECK (split_mode IN ('total', 'equal', 'items')),
  split_count int DEFAULT 1,
  items jsonb NOT NULL,
  closed_at timestamptz NOT NULL DEFAULT now()
);

-- ── Action logs ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES public.staff(id),
  staff_name text,
  action text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Inventory ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('commercial', 'internal')),
  quantity numeric(10, 2) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'pcs',
  sold_out boolean NOT NULL DEFAULT false
);

INSERT INTO public.inventory_items (name, category, quantity, unit) VALUES
  ('Beef slices', 'commercial', 50, 'kg'),
  ('Chicken broth', 'commercial', 30, 'L'),
  ('Red wine', 'commercial', 24, 'bottles'),
  ('Wooden spoons (yogurt prep)', 'internal', 200, 'pcs'),
  ('Serving trays', 'internal', 40, 'pcs')
ON CONFLICT DO NOTHING;

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read" ON public.staff FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "order_items_all" ON public.order_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sales_all" ON public.sales FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "action_logs_all" ON public.action_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "inventory_all" ON public.inventory_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.tables;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items;
