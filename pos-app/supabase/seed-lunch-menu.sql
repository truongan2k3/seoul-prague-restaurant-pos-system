-- Seed lunch menu items (run after patch-lunch-menu-customization.sql)
-- Category: Lunch Menu

DO $$
DECLARE
  cat_id uuid;
  side_swap jsonb := '[
    {"id":"rice","nameEn":"Rice (included)","nameCz":"Rýže (v ceně)","nameZh":"米饭","priceDelta":0,"default":true},
    {"id":"noodles","nameEn":"Noodles","nameCz":"Nudle","nameZh":"面条","priceDelta":30},
    {"id":"rice_noodles","nameEn":"Rice noodles","nameCz":"Rýžové nudle","nameZh":"河粉","priceDelta":30},
    {"id":"fried_rice","nameEn":"Fried rice","nameCz":"Smažená rýže","nameZh":"炒饭","priceDelta":30},
    {"id":"fries","nameEn":"Fries","nameCz":"Hranolky","nameZh":"薯条","priceDelta":30},
    {"id":"croquettes","nameEn":"Croquettes","nameCz":"Krokety","nameZh":"炸薯球","priceDelta":30}
  ]'::jsonb;
  protein_noodle jsonb := '[
    {"id":"chicken","nameEn":"Chicken","nameCz":"Kuřecí","nameZh":"鸡肉","price":169},
    {"id":"pork","nameEn":"Pork","nameCz":"Vepřové","nameZh":"猪肉","price":169,"default":true},
    {"id":"beef","nameEn":"Beef","nameCz":"Hovězí","nameZh":"牛肉","price":179},
    {"id":"shrimp","nameEn":"Shrimp","nameCz":"Krevety","nameZh":"虾","price":199},
    {"id":"tofu","nameEn":"Tofu","nameCz":"Tofu","nameZh":"豆腐","price":169}
  ]'::jsonb;
  protein_main jsonb := '[
    {"id":"chicken","nameEn":"Chicken","nameCz":"Kuřecí","nameZh":"鸡肉","price":179},
    {"id":"pork","nameEn":"Pork","nameCz":"Vepřové","nameZh":"猪肉","price":179,"default":true},
    {"id":"beef","nameEn":"Beef","nameCz":"Hovězí","nameZh":"牛肉","price":189},
    {"id":"shrimp","nameEn":"Shrimp","nameCz":"Krevety","nameZh":"虾","price":199},
    {"id":"tofu","nameEn":"Tofu","nameCz":"Tofu","nameZh":"豆腐","price":179}
  ]'::jsonb;
  free_soup jsonb := '{"nameEn":"Spicy soup","nameCz":"Pikantní polévka","nameZh":"辣汤","onRequest":true}'::jsonb;
  cfg_noodle jsonb;
  cfg_main jsonb;
BEGIN
  SELECT id INTO cat_id FROM public.categories WHERE lower(trim(name)) = 'lunch menu' LIMIT 1;
  IF cat_id IS NULL THEN
    RAISE NOTICE 'Lunch Menu category not found — run patch-lunch-menu-customization.sql first';
    RETURN;
  END IF;

  cfg_noodle := jsonb_build_object(
    'basePriceFromOptions', true,
    'optionGroups', jsonb_build_array(
      jsonb_build_object('id','protein','nameEn','Protein','nameCz','Maso','nameZh','肉类','required',true,'options',protein_noodle),
      jsonb_build_object('id','side','nameEn','Side dish','nameCz','Příloha','nameZh','配菜','required',true,'options',side_swap)
    ),
    'freeAddOn', free_soup
  );

  cfg_main := jsonb_build_object(
    'basePriceFromOptions', true,
    'optionGroups', jsonb_build_array(
      jsonb_build_object('id','protein','nameEn','Protein','nameCz','Maso','nameZh','肉类','required',true,'options',protein_main),
      jsonb_build_object('id','side','nameEn','Side dish','nameCz','Příloha','nameZh','配菜','required',true,'options',side_swap)
    ),
    'freeAddOn', free_soup
  );

  -- Remove prior lunch seed rows (by category) so script is re-runnable
  DELETE FROM public.menu_items WHERE category_id = cat_id;

  INSERT INTO public.menu_items (
    name_en, name_cz, name_zh, name, category, category_id, price,
    station, item_type, is_available, sold_out, sort_order, display_order, customization_config
  ) VALUES
  -- Soups & starters (fixed price)
  ('Spicy Soup', 'Pikantní', '辣汤', 'Spicy Soup', 'Lunch Menu', cat_id, 79, 'kitchen', 'food', true, false, 1, 1, NULL),
  ('Corn Soup', 'Kukuřiční', '玉米汤', 'Corn Soup', 'Lunch Menu', cat_id, 79, 'kitchen', 'food', true, false, 2, 2, NULL),
  ('Thai Soup', 'Thajská', '泰式汤', 'Thai Soup', 'Lunch Menu', cat_id, 99, 'kitchen', 'food', true, false, 3, 3, NULL),
  ('Mini Spring Rolls', 'Mini závitky', '迷你春卷', 'Mini Spring Rolls', 'Lunch Menu', cat_id, 79, 'kitchen', 'food', true, false, 4, 4, NULL),

  -- Noodle / rice bases (choose protein + side)
  ('Noodles', 'Nudle', '炒面', 'Noodles', 'Lunch Menu', cat_id, 169, 'kitchen', 'food', true, false, 10, 10, cfg_noodle),
  ('Kung Pao Noodles', 'Nudle kung pao', '宫保面', 'Kung Pao Noodles', 'Lunch Menu', cat_id, 169, 'kitchen', 'food', true, false, 11, 11, cfg_noodle),
  ('Udon', 'Udon', '乌冬面', 'Udon', 'Lunch Menu', cat_id, 169, 'kitchen', 'food', true, false, 12, 12, cfg_noodle),
  ('Rice Noodles', 'Rýžové nudle', '河粉', 'Rice Noodles', 'Lunch Menu', cat_id, 169, 'kitchen', 'food', true, false, 13, 13, cfg_noodle),
  ('Fried Rice', 'Restovaná rýže', '炒饭', 'Fried Rice', 'Lunch Menu', cat_id, 169, 'kitchen', 'food', true, false, 14, 14, cfg_noodle),

  -- Large bowls (fixed; free soup optional via cart note or we add freeAddOn only on mains)
  ('Chicken Pho', 'Pho kuřecí', '鸡肉河粉', 'Chicken Pho', 'Lunch Menu', cat_id, 209, 'kitchen', 'food', true, false, 20, 20,
    jsonb_build_object('freeAddOn', free_soup)),
  ('Beef Pho', 'Pho hovězí', '牛肉河粉', 'Beef Pho', 'Lunch Menu', cat_id, 229, 'kitchen', 'food', true, false, 21, 21,
    jsonb_build_object('freeAddOn', free_soup)),
  ('Bun Bo Nam Bo', 'Bun bo nam bo', '越南拌粉', 'Bun Bo Nam Bo', 'Lunch Menu', cat_id, 229, 'kitchen', 'food', true, false, 22, 22,
    jsonb_build_object('freeAddOn', free_soup)),
  ('Bun Cha', 'Bun cha', '烤肉米线', 'Bun Cha', 'Lunch Menu', cat_id, 209, 'kitchen', 'food', true, false, 23, 23,
    jsonb_build_object('freeAddOn', free_soup)),

  -- Main dishes page 2 (protein + side + free soup)
  ('Bamboo & Mushrooms', 'Bambus & houby', '竹笋蘑菇', 'Bamboo & Mushrooms', 'Lunch Menu', cat_id, 179, 'kitchen', 'food', true, false, 30, 30, cfg_main),
  ('Kung Pao', 'Kung Pao', '宫保', 'Kung Pao', 'Lunch Menu', cat_id, 179, 'kitchen', 'food', true, false, 31, 31, cfg_main),
  ('Mapo', 'Mapo', '麻婆', 'Mapo', 'Lunch Menu', cat_id, 179, 'kitchen', 'food', true, false, 32, 32, cfg_main),
  ('Szechuan', 'Sečuan', '四川', 'Szechuan', 'Lunch Menu', cat_id, 179, 'kitchen', 'food', true, false, 33, 33, cfg_main),

  -- Duck dishes (fixed 209 + side swap + free soup)
  ('Duck Classic', 'Kachna — Klasika', '经典鸭', 'Duck Classic', 'Lunch Menu', cat_id, 209, 'kitchen', 'food', true, false, 40, 40,
    jsonb_build_object(
      'optionGroups', jsonb_build_array(
        jsonb_build_object('id','side','nameEn','Side dish','nameCz','Příloha','nameZh','配菜','required',true,'options',side_swap)
      ),
      'freeAddOn', free_soup
    )),
  ('Duck with Honey', 'Kachna — Na medu', '蜜汁鸭', 'Duck with Honey', 'Lunch Menu', cat_id, 209, 'kitchen', 'food', true, false, 41, 41,
    jsonb_build_object(
      'optionGroups', jsonb_build_array(
        jsonb_build_object('id','side','nameEn','Side dish','nameCz','Příloha','nameZh','配菜','required',true,'options',side_swap)
      ),
      'freeAddOn', free_soup
    )),

  -- Chicken pieces (fixed 179 + side + free soup)
  ('Sweet & Sour Chicken', 'Kuřecí kousky — Sladkokyselé', '糖醋鸡块', 'Sweet & Sour Chicken', 'Lunch Menu', cat_id, 179, 'kitchen', 'food', true, false, 50, 50,
    jsonb_build_object(
      'optionGroups', jsonb_build_array(
        jsonb_build_object('id','side','nameEn','Side dish','nameCz','Příloha','nameZh','配菜','required',true,'options',side_swap)
      ),
      'freeAddOn', free_soup
    )),
  ('Eight Treasures', 'Osm pokladů', '八宝', 'Eight Treasures', 'Lunch Menu', cat_id, 199, 'kitchen', 'food', true, false, 51, 51,
    jsonb_build_object(
      'optionGroups', jsonb_build_array(
        jsonb_build_object('id','side','nameEn','Side dish','nameCz','Příloha','nameZh','配菜','required',true,'options',side_swap)
      ),
      'freeAddOn', free_soup
    )),
  ('Hunan Chicken', 'Hunan', '湖南鸡', 'Hunan Chicken', 'Lunch Menu', cat_id, 179, 'kitchen', 'food', true, false, 52, 52,
    jsonb_build_object(
      'optionGroups', jsonb_build_array(
        jsonb_build_object('id','side','nameEn','Side dish','nameCz','Příloha','nameZh','配菜','required',true,'options',side_swap)
      ),
      'freeAddOn', free_soup
    ));

  RAISE NOTICE 'Lunch menu seeded: % items', (SELECT count(*) FROM public.menu_items WHERE category_id = cat_id);
END $$;
