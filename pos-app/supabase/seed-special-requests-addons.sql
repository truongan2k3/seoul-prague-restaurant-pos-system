-- Special requests + side-dish add-ons (EN / CZ / ZH — no Vietnamese)
-- Run in Supabase SQL Editor after:
--   patch-lunch-menu-customization.sql
--   patch-option-group-library.sql
--
-- Safe to re-run: upserts by English label / group name, then dedupes by label.

-- Remove duplicate rows before unique indexes (keep lowest id per label)
DELETE FROM public.note_presets a
USING public.note_presets b
WHERE lower(trim(a.label_en)) = lower(trim(b.label_en))
  AND a.id > b.id;

DELETE FROM public.option_group_library a
USING public.option_group_library b
WHERE lower(trim(a.name_en)) = lower(trim(b.name_en))
  AND a.id > b.id;

-- ---------------------------------------------------------------------------
-- 1. Special requests (note_presets → Storage → Special requests)
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_note_presets_label_en_unique
  ON public.note_presets (lower(trim(label_en)));

INSERT INTO public.note_presets (label_en, label_cz, label_zh, display_order, active)
VALUES
  ('No Spicy', 'Nepálivé / Bez chilli', '不辣', 1, true),
  ('Little Spicy', 'Mírně pálivé / Málo chilli', '微辣', 2, true),
  ('Very Spicy', 'Hodně pálivé', '特辣', 3, true),
  ('Extra Spicy', 'Extra pálivé / Velmi hodně pálivé', '超辣', 4, true),
  ('No Coriander', 'Bez koriandru', '不要香菜', 5, true),
  ('No Spring Onions', 'Bez jarní cibulky', '不要葱花', 6, true),
  ('No Vegetable / Salad', 'Bez zeleniny / salátu', '不要蔬菜', 7, true),
  ('Sauces Separate', 'Omáčka zvlášť', '酱汁分开装', 8, true)
ON CONFLICT ((lower(trim(label_en))))
DO UPDATE SET
  label_cz = EXCLUDED.label_cz,
  label_zh = EXCLUDED.label_zh,
  display_order = EXCLUDED.display_order,
  active = true;

-- Retire legacy presets replaced by this list
UPDATE public.note_presets
SET active = false
WHERE lower(trim(label_en)) IN (
  'less spicy',
  'no onion',
  'takeaway'
);

-- ---------------------------------------------------------------------------
-- 2. Side-dish swap add-ons (+30 Kč) → Storage → Add-ons (option_group_library)
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_option_group_library_name_en_unique
  ON public.option_group_library (lower(trim(name_en)));

INSERT INTO public.option_group_library (
  name_en,
  name_cz,
  name_zh,
  required,
  multi,
  options,
  display_order,
  active
)
VALUES (
  'Side dish',
  'Příloha',
  '配菜',
  true,
  false,
  '[
    {"id":"rice","nameEn":"Rice (included)","nameCz":"Rýže (v ceně)","nameZh":"米饭","priceDelta":0,"default":true},
    {"id":"noodles","nameEn":"Fried Noodles","nameCz":"Nudle","nameZh":"炒面","priceDelta":30},
    {"id":"rice_noodles","nameEn":"Fried Rice Noodles","nameCz":"Rýžové nudle","nameZh":"炒米粉","priceDelta":30},
    {"id":"fried_rice","nameEn":"Fried Rice","nameCz":"Smažená rýže","nameZh":"炒饭","priceDelta":30},
    {"id":"fries","nameEn":"French Fries","nameCz":"Hranolky","nameZh":"炸薯条","priceDelta":30},
    {"id":"croquettes","nameEn":"Potato Croquettes","nameCz":"Krokety","nameZh":"炸土豆球","priceDelta":30}
  ]'::jsonb,
  1,
  true
)
ON CONFLICT ((lower(trim(name_en))))
DO UPDATE SET
  name_cz = EXCLUDED.name_cz,
  name_zh = EXCLUDED.name_zh,
  required = EXCLUDED.required,
  multi = EXCLUDED.multi,
  options = EXCLUDED.options,
  display_order = EXCLUDED.display_order,
  active = true;
