-- Lunch menu customization + special request presets
-- Run in Supabase SQL editor after existing menu patches.

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS customization_config jsonb;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS modifiers jsonb;

CREATE TABLE IF NOT EXISTS public.note_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_en text NOT NULL,
  label_cz text,
  label_zh text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.note_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "note_presets_all" ON public.note_presets;
CREATE POLICY "note_presets_all" ON public.note_presets
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_note_presets_display_order ON public.note_presets (display_order, label_en);

-- Default special-request presets (kitchen Chinese pre-filled)
-- Full list: run supabase/seed-special-requests-addons.sql
INSERT INTO public.note_presets (label_en, label_cz, label_zh, display_order)
SELECT * FROM (VALUES
  ('No Spicy', 'Nepálivé / Bez chilli', '不辣', 1),
  ('Little Spicy', 'Mírně pálivé / Málo chilli', '微辣', 2),
  ('Very Spicy', 'Hodně pálivé', '特辣', 3),
  ('Extra Spicy', 'Extra pálivé / Velmi hodně pálivé', '超辣', 4),
  ('No Coriander', 'Bez koriandru', '不要香菜', 5),
  ('No Spring Onions', 'Bez jarní cibulky', '不要葱花', 6),
  ('No Vegetable / Salad', 'Bez zeleniny / salátu', '不要蔬菜', 7),
  ('Sauces Separate', 'Omáčka zvlášť', '酱汁分开装', 8)
) AS v(label_en, label_cz, label_zh, display_order)
WHERE NOT EXISTS (SELECT 1 FROM public.note_presets LIMIT 1);

-- Lunch menu: run supabase/seed-lunch-menu.sql for 7 sub-categories (59 fixed-price items).
-- Legacy single "Lunch Menu" category is removed by that seed.
