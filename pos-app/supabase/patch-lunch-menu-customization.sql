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
INSERT INTO public.note_presets (label_en, label_cz, label_zh, display_order)
SELECT * FROM (VALUES
  ('No Spicy', 'Ne pikantní', '不要辣', 1),
  ('Less Spicy', 'Méně pikantní', '微辣', 2),
  ('No Onion', 'Bez cibule', '不要洋葱', 3),
  ('No Coriander', 'Bez koriandru', '不要香菜', 4),
  ('Takeaway', 'S sebou', '打包', 5)
) AS v(label_en, label_cz, label_zh, display_order)
WHERE NOT EXISTS (SELECT 1 FROM public.note_presets LIMIT 1);

-- Lunch category
INSERT INTO public.categories (name, type, display_order)
SELECT 'Lunch Menu', 'dish', 50
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE lower(trim(name)) = 'lunch menu');

-- Shared JSON fragments (protein + side swap groups)
-- Side swap: rice included, +30 Kč for alternatives (per menu header note)
-- Free Pikantní soup on request for main dishes
