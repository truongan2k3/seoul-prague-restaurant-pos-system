-- Replace legacy menu_items table with JIN CHENG multilingual structure (fresh install only)
-- For existing databases use patch-menu-jin-cheng-schema.sql + seed-menu-jin-cheng.sql instead.

CREATE TABLE IF NOT EXISTS public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  price numeric(10, 2) NOT NULL,
  name_en text NOT NULL,
  name_cz text,
  name_zh text,
  description_en text,
  description_cz text,
  description_zh text,
  image_url text,
  is_available boolean NOT NULL DEFAULT true,
  station text NOT NULL DEFAULT 'kitchen' CHECK (station IN ('kitchen', 'bar')),
  item_type text NOT NULL DEFAULT 'food' CHECK (item_type IN ('food', 'drink')),
  sort_order int NOT NULL DEFAULT 0,
  -- Legacy mirror columns (optional compatibility)
  name text,
  description text,
  sold_out boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_category ON public.menu_items (category);
CREATE INDEX IF NOT EXISTS idx_menu_items_available ON public.menu_items (is_available);

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_items_select" ON public.menu_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "menu_items_insert" ON public.menu_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "menu_items_update" ON public.menu_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "menu_items_delete" ON public.menu_items FOR DELETE TO anon, authenticated USING (true);
