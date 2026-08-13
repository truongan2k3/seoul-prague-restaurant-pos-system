-- Lunch menu seed (59 items, 7 sub-categories)
-- Run after patch-lunch-menu-customization.sql
-- Replaces legacy single-tab Lunch Menu with fixed-price items (no protein option groups).

DO $$
DECLARE
  cat_id uuid;
  lunch_names text[] := ARRAY[
    'Lunch Menu',
    'Polévky & Předkrmy',
    'Tradiční Vietnam',
    'Nudle, Udon & Rýže',
    'Restované & omáčky',
    'Kachna',
    'Kuřecí kousky',
    'Speciality'
  ];
  n text;
BEGIN
  FOREACH n IN ARRAY lunch_names LOOP
    DELETE FROM public.menu_items
    WHERE category_id IN (
      SELECT id FROM public.categories WHERE lower(trim(name)) = lower(trim(n))
    );
  END LOOP;

  DELETE FROM public.categories WHERE lower(trim(name)) = 'lunch menu';


  INSERT INTO public.categories (name, type, display_order)
  SELECT 'Polévky & Předkrmy', 'dish', 50
  WHERE NOT EXISTS (
    SELECT 1 FROM public.categories WHERE lower(trim(name)) = lower(trim('Polévky & Předkrmy'))
  );
  UPDATE public.categories SET display_order = 50, type = 'dish'
  WHERE lower(trim(name)) = lower(trim('Polévky & Předkrmy'));

  INSERT INTO public.categories (name, type, display_order)
  SELECT 'Tradiční Vietnam', 'dish', 51
  WHERE NOT EXISTS (
    SELECT 1 FROM public.categories WHERE lower(trim(name)) = lower(trim('Tradiční Vietnam'))
  );
  UPDATE public.categories SET display_order = 51, type = 'dish'
  WHERE lower(trim(name)) = lower(trim('Tradiční Vietnam'));

  INSERT INTO public.categories (name, type, display_order)
  SELECT 'Nudle, Udon & Rýže', 'dish', 52
  WHERE NOT EXISTS (
    SELECT 1 FROM public.categories WHERE lower(trim(name)) = lower(trim('Nudle, Udon & Rýže'))
  );
  UPDATE public.categories SET display_order = 52, type = 'dish'
  WHERE lower(trim(name)) = lower(trim('Nudle, Udon & Rýže'));

  INSERT INTO public.categories (name, type, display_order)
  SELECT 'Restované & omáčky', 'dish', 53
  WHERE NOT EXISTS (
    SELECT 1 FROM public.categories WHERE lower(trim(name)) = lower(trim('Restované & omáčky'))
  );
  UPDATE public.categories SET display_order = 53, type = 'dish'
  WHERE lower(trim(name)) = lower(trim('Restované & omáčky'));

  INSERT INTO public.categories (name, type, display_order)
  SELECT 'Kachna', 'dish', 54
  WHERE NOT EXISTS (
    SELECT 1 FROM public.categories WHERE lower(trim(name)) = lower(trim('Kachna'))
  );
  UPDATE public.categories SET display_order = 54, type = 'dish'
  WHERE lower(trim(name)) = lower(trim('Kachna'));

  INSERT INTO public.categories (name, type, display_order)
  SELECT 'Kuřecí kousky', 'dish', 55
  WHERE NOT EXISTS (
    SELECT 1 FROM public.categories WHERE lower(trim(name)) = lower(trim('Kuřecí kousky'))
  );
  UPDATE public.categories SET display_order = 55, type = 'dish'
  WHERE lower(trim(name)) = lower(trim('Kuřecí kousky'));

  INSERT INTO public.categories (name, type, display_order)
  SELECT 'Speciality', 'dish', 56
  WHERE NOT EXISTS (
    SELECT 1 FROM public.categories WHERE lower(trim(name)) = lower(trim('Speciality'))
  );
  UPDATE public.categories SET display_order = 56, type = 'dish'
  WHERE lower(trim(name)) = lower(trim('Speciality'));


  SELECT id INTO cat_id FROM public.categories WHERE lower(trim(name)) = lower(trim('Polévky & Předkrmy')) LIMIT 1;
  IF cat_id IS NULL THEN
    RAISE EXCEPTION 'Category not found: Polévky & Předkrmy';
  END IF;
  INSERT INTO public.menu_items (
    name_en, name_cz, name_zh, name, category, category_id, price,
    station, item_type, is_available, sold_out, sort_order, display_order, customization_config
  ) VALUES
  ('Hot & Sour Soup (Chicken)', 'Pikantní · kuřecí', '酸辣汤 (鸡肉)', 'Hot & Sour Soup (Chicken)', 'Polévky & Předkrmy', cat_id, 79, 'kitchen', 'food', true, false, 1, 1, NULL),
  ('Chicken Soup with Bamboo & Mushrooms', 'Bambus & houby · kuřecí', '竹笋香菇鸡汤', 'Chicken Soup with Bamboo & Mushrooms', 'Polévky & Předkrmy', cat_id, 79, 'kitchen', 'food', true, false, 2, 2, NULL),
  ('Chicken Corn Soup', 'Kukuřičná · kuřecí', '玉米鸡肉汤', 'Chicken Corn Soup', 'Polévky & Předkrmy', cat_id, 79, 'kitchen', 'food', true, false, 3, 3, NULL),
  ('Thai Spicy Soup (Prawns)', 'Thajská · krevety', '泰式海鲜/虾汤', 'Thai Spicy Soup (Prawns)', 'Polévky & Předkrmy', cat_id, 99, 'kitchen', 'food', true, false, 4, 4, NULL),
  ('Mini Spring Rolls (Vegetables)', 'Mini závitky · zeleninové', '蔬菜小春卷', 'Mini Spring Rolls (Vegetables)', 'Polévky & Předkrmy', cat_id, 79, 'kitchen', 'food', true, false, 5, 5, NULL);

  SELECT id INTO cat_id FROM public.categories WHERE lower(trim(name)) = lower(trim('Tradiční Vietnam')) LIMIT 1;
  IF cat_id IS NULL THEN
    RAISE EXCEPTION 'Category not found: Tradiční Vietnam';
  END IF;
  INSERT INTO public.menu_items (
    name_en, name_cz, name_zh, name, category, category_id, price,
    station, item_type, is_available, sold_out, sort_order, display_order, customization_config
  ) VALUES
  ('Chicken Pho', 'Pho kuřecí', '鸡肉河粉', 'Chicken Pho', 'Tradiční Vietnam', cat_id, 209, 'kitchen', 'food', true, false, 1, 1, NULL),
  ('Beef Pho', 'Pho hovězí', '牛肉河粉', 'Beef Pho', 'Tradiční Vietnam', cat_id, 229, 'kitchen', 'food', true, false, 2, 2, NULL),
  ('Bun Bo Nam Bo (Beef Noodle Salad)', 'Bun bo nam bo', '南部牛肉干拌粉', 'Bun Bo Nam Bo (Beef Noodle Salad)', 'Tradiční Vietnam', cat_id, 229, 'kitchen', 'food', true, false, 3, 3, NULL),
  ('Bun Cha (Grilled Pork Noodle)', 'Bun cha', '烤肉米粉', 'Bun Cha (Grilled Pork Noodle)', 'Tradiční Vietnam', cat_id, 209, 'kitchen', 'food', true, false, 4, 4, NULL);

  SELECT id INTO cat_id FROM public.categories WHERE lower(trim(name)) = lower(trim('Nudle, Udon & Rýže')) LIMIT 1;
  IF cat_id IS NULL THEN
    RAISE EXCEPTION 'Category not found: Nudle, Udon & Rýže';
  END IF;
  INSERT INTO public.menu_items (
    name_en, name_cz, name_zh, name, category, category_id, price,
    station, item_type, is_available, sold_out, sort_order, display_order, customization_config
  ) VALUES
  ('Fried Noodles with Chicken', 'Nudle · kuřecí', '鸡肉炒面', 'Fried Noodles with Chicken', 'Nudle, Udon & Rýže', cat_id, 169, 'kitchen', 'food', true, false, 1, 1, NULL),
  ('Fried Noodles with Pork', 'Nudle · vepřové', '猪肉炒面', 'Fried Noodles with Pork', 'Nudle, Udon & Rýže', cat_id, 169, 'kitchen', 'food', true, false, 2, 2, NULL),
  ('Fried Noodles with Tofu', 'Nudle · tofu', '豆腐炒面', 'Fried Noodles with Tofu', 'Nudle, Udon & Rýže', cat_id, 169, 'kitchen', 'food', true, false, 3, 3, NULL),
  ('Fried Noodles with Beef', 'Nudle · hovězí', '牛肉炒面', 'Fried Noodles with Beef', 'Nudle, Udon & Rýže', cat_id, 179, 'kitchen', 'food', true, false, 4, 4, NULL),
  ('Fried Noodles with Prawns', 'Nudle · krevety', '大虾炒面', 'Fried Noodles with Prawns', 'Nudle, Udon & Rýže', cat_id, 199, 'kitchen', 'food', true, false, 5, 5, NULL),
  ('Kung Pao Noodles', 'Nudle kung pao', '宫保炒面', 'Kung Pao Noodles', 'Nudle, Udon & Rýže', cat_id, 169, 'kitchen', 'food', true, false, 6, 6, NULL),
  ('Fried Udon with Chicken', 'Udon · kuřecí', '鸡肉炒乌冬面', 'Fried Udon with Chicken', 'Nudle, Udon & Rýže', cat_id, 169, 'kitchen', 'food', true, false, 7, 7, NULL),
  ('Fried Udon with Pork', 'Udon · vepřové', '猪肉炒乌冬面', 'Fried Udon with Pork', 'Nudle, Udon & Rýže', cat_id, 169, 'kitchen', 'food', true, false, 8, 8, NULL),
  ('Fried Udon with Tofu', 'Udon · tofu', '豆腐炒乌冬面', 'Fried Udon with Tofu', 'Nudle, Udon & Rýže', cat_id, 169, 'kitchen', 'food', true, false, 9, 9, NULL),
  ('Fried Udon with Beef', 'Udon · hovězí', '牛肉炒乌冬面', 'Fried Udon with Beef', 'Nudle, Udon & Rýže', cat_id, 179, 'kitchen', 'food', true, false, 10, 10, NULL),
  ('Fried Udon with Prawns', 'Udon · krevety', '大虾炒乌冬面', 'Fried Udon with Prawns', 'Nudle, Udon & Rýže', cat_id, 199, 'kitchen', 'food', true, false, 11, 11, NULL),
  ('Fried Rice Noodles with Chicken', 'Rýžové nudle · kuřecí', '鸡肉炒米粉', 'Fried Rice Noodles with Chicken', 'Nudle, Udon & Rýže', cat_id, 169, 'kitchen', 'food', true, false, 12, 12, NULL),
  ('Fried Rice Noodles with Pork', 'Rýžové nudle · vepřové', '猪肉炒米粉', 'Fried Rice Noodles with Pork', 'Nudle, Udon & Rýže', cat_id, 169, 'kitchen', 'food', true, false, 13, 13, NULL),
  ('Fried Rice Noodles with Tofu', 'Rýžové nudle · tofu', '豆腐炒米粉', 'Fried Rice Noodles with Tofu', 'Nudle, Udon & Rýže', cat_id, 169, 'kitchen', 'food', true, false, 14, 14, NULL),
  ('Fried Rice Noodles with Beef', 'Rýžové nudle · hovězí', '牛肉炒米粉', 'Fried Rice Noodles with Beef', 'Nudle, Udon & Rýže', cat_id, 179, 'kitchen', 'food', true, false, 15, 15, NULL),
  ('Fried Rice Noodles with Prawns', 'Rýžové nudle · krevety', '大虾炒米粉', 'Fried Rice Noodles with Prawns', 'Nudle, Udon & Rýže', cat_id, 199, 'kitchen', 'food', true, false, 16, 16, NULL),
  ('Fried Rice with Chicken', 'Restovaná rýže · kuřecí', '鸡肉炒饭', 'Fried Rice with Chicken', 'Nudle, Udon & Rýže', cat_id, 169, 'kitchen', 'food', true, false, 17, 17, NULL),
  ('Fried Rice with Pork', 'Restovaná rýže · vepřové', '猪肉炒饭', 'Fried Rice with Pork', 'Nudle, Udon & Rýže', cat_id, 169, 'kitchen', 'food', true, false, 18, 18, NULL),
  ('Fried Rice with Tofu', 'Restovaná rýže · tofu', '豆腐炒饭', 'Fried Rice with Tofu', 'Nudle, Udon & Rýže', cat_id, 169, 'kitchen', 'food', true, false, 19, 19, NULL),
  ('Fried Rice with Beef', 'Restovaná rýže · hovězí', '牛肉炒饭', 'Fried Rice with Beef', 'Nudle, Udon & Rýže', cat_id, 179, 'kitchen', 'food', true, false, 20, 20, NULL),
  ('Fried Rice with Prawns', 'Restovaná rýže · krevety', '大虾炒饭', 'Fried Rice with Prawns', 'Nudle, Udon & Rýže', cat_id, 199, 'kitchen', 'food', true, false, 21, 21, NULL);

  SELECT id INTO cat_id FROM public.categories WHERE lower(trim(name)) = lower(trim('Restované & omáčky')) LIMIT 1;
  IF cat_id IS NULL THEN
    RAISE EXCEPTION 'Category not found: Restované & omáčky';
  END IF;
  INSERT INTO public.menu_items (
    name_en, name_cz, name_zh, name, category, category_id, price,
    station, item_type, is_available, sold_out, sort_order, display_order, customization_config
  ) VALUES
  ('Stir-fried Chicken with Bamboo & Mushrooms', 'Bambus & houby · kuřecí', '竹笋香菇炒鸡肉', 'Stir-fried Chicken with Bamboo & Mushrooms', 'Restované & omáčky', cat_id, 179, 'kitchen', 'food', true, false, 1, 1, NULL),
  ('Stir-fried Pork with Bamboo & Mushrooms', 'Bambus & houby · vepřové', '竹笋香菇炒猪肉', 'Stir-fried Pork with Bamboo & Mushrooms', 'Restované & omáčky', cat_id, 179, 'kitchen', 'food', true, false, 2, 2, NULL),
  ('Stir-fried Tofu with Bamboo & Mushrooms', 'Bambus & houby · tofu', '竹笋香菇炒豆腐', 'Stir-fried Tofu with Bamboo & Mushrooms', 'Restované & omáčky', cat_id, 179, 'kitchen', 'food', true, false, 3, 3, NULL),
  ('Stir-fried Beef with Bamboo & Mushrooms', 'Bambus & houby · hovězí', '竹笋香菇炒牛肉', 'Stir-fried Beef with Bamboo & Mushrooms', 'Restované & omáčky', cat_id, 189, 'kitchen', 'food', true, false, 4, 4, NULL),
  ('Stir-fried Prawns with Bamboo & Mushrooms', 'Bambus & houby · krevety', '竹笋香菇炒大虾', 'Stir-fried Prawns with Bamboo & Mushrooms', 'Restované & omáčky', cat_id, 199, 'kitchen', 'food', true, false, 5, 5, NULL),
  ('Kung Pao Chicken', 'Kung Pao · kuřecí', '宫保鸡丁', 'Kung Pao Chicken', 'Restované & omáčky', cat_id, 179, 'kitchen', 'food', true, false, 6, 6, NULL),
  ('Kung Pao Pork', 'Kung Pao · vepřové', '宫保猪肉', 'Kung Pao Pork', 'Restované & omáčky', cat_id, 179, 'kitchen', 'food', true, false, 7, 7, NULL),
  ('Kung Pao Tofu', 'Kung Pao · tofu', '宫保豆腐', 'Kung Pao Tofu', 'Restované & omáčky', cat_id, 179, 'kitchen', 'food', true, false, 8, 8, NULL),
  ('Kung Pao Beef', 'Kung Pao · hovězí', '宫保牛肉', 'Kung Pao Beef', 'Restované & omáčky', cat_id, 189, 'kitchen', 'food', true, false, 9, 9, NULL),
  ('Kung Pao Prawns', 'Kung Pao · krevety', '宫保大虾', 'Kung Pao Prawns', 'Restované & omáčky', cat_id, 199, 'kitchen', 'food', true, false, 10, 10, NULL),
  ('Mapo Chicken', 'Mapo · kuřecí', '麻婆鸡肉', 'Mapo Chicken', 'Restované & omáčky', cat_id, 179, 'kitchen', 'food', true, false, 11, 11, NULL),
  ('Mapo Pork', 'Mapo · vepřové', '麻婆猪肉', 'Mapo Pork', 'Restované & omáčky', cat_id, 179, 'kitchen', 'food', true, false, 12, 12, NULL),
  ('Mapo Tofu', 'Mapo · tofu', '麻婆豆腐', 'Mapo Tofu', 'Restované & omáčky', cat_id, 179, 'kitchen', 'food', true, false, 13, 13, NULL),
  ('Mapo Beef', 'Mapo · hovězí', '麻婆牛肉', 'Mapo Beef', 'Restované & omáčky', cat_id, 189, 'kitchen', 'food', true, false, 14, 14, NULL),
  ('Mapo Prawns', 'Mapo · krevety', '麻婆大虾', 'Mapo Prawns', 'Restované & omáčky', cat_id, 199, 'kitchen', 'food', true, false, 15, 15, NULL),
  ('Sichuan Chicken', 'Sečuan · kuřecí', '四川鸡肉', 'Sichuan Chicken', 'Restované & omáčky', cat_id, 179, 'kitchen', 'food', true, false, 16, 16, NULL),
  ('Sichuan Pork', 'Sečuan · vepřové', '四川猪肉', 'Sichuan Pork', 'Restované & omáčky', cat_id, 179, 'kitchen', 'food', true, false, 17, 17, NULL),
  ('Sichuan Tofu', 'Sečuan · tofu', '四川豆腐', 'Sichuan Tofu', 'Restované & omáčky', cat_id, 179, 'kitchen', 'food', true, false, 18, 18, NULL),
  ('Sichuan Beef', 'Sečuan · hovězí', '四川牛肉', 'Sichuan Beef', 'Restované & omáčky', cat_id, 189, 'kitchen', 'food', true, false, 19, 19, NULL),
  ('Sichuan Prawns', 'Sečuan · krevety', '四川大虾', 'Sichuan Prawns', 'Restované & omáčky', cat_id, 199, 'kitchen', 'food', true, false, 20, 20, NULL);

  SELECT id INTO cat_id FROM public.categories WHERE lower(trim(name)) = lower(trim('Kachna')) LIMIT 1;
  IF cat_id IS NULL THEN
    RAISE EXCEPTION 'Category not found: Kachna';
  END IF;
  INSERT INTO public.menu_items (
    name_en, name_cz, name_zh, name, category, category_id, price,
    station, item_type, is_available, sold_out, sort_order, display_order, customization_config
  ) VALUES
  ('Classic Crispy Duck', 'Klasika', '经典炸鸭', 'Classic Crispy Duck', 'Kachna', cat_id, 209, 'kitchen', 'food', true, false, 1, 1, NULL),
  ('Honey Duck', 'Na medu', '蜜汁鸭', 'Honey Duck', 'Kachna', cat_id, 209, 'kitchen', 'food', true, false, 2, 2, NULL),
  ('Sichuan Style Duck', 'Sečuan', '四川鸭', 'Sichuan Style Duck', 'Kachna', cat_id, 209, 'kitchen', 'food', true, false, 3, 3, NULL),
  ('Duck with Bamboo & Mushrooms', 'Bambus & houby', '竹笋香菇鸭', 'Duck with Bamboo & Mushrooms', 'Kachna', cat_id, 209, 'kitchen', 'food', true, false, 4, 4, NULL);

  SELECT id INTO cat_id FROM public.categories WHERE lower(trim(name)) = lower(trim('Kuřecí kousky')) LIMIT 1;
  IF cat_id IS NULL THEN
    RAISE EXCEPTION 'Category not found: Kuřecí kousky';
  END IF;
  INSERT INTO public.menu_items (
    name_en, name_cz, name_zh, name, category, category_id, price,
    station, item_type, is_available, sold_out, sort_order, display_order, customization_config
  ) VALUES
  ('Sweet & Sour Chicken', 'Sladkokyselé', '糖醋鸡块', 'Sweet & Sour Chicken', 'Kuřecí kousky', cat_id, 179, 'kitchen', 'food', true, false, 1, 1, NULL),
  ('Strange-Flavor Chicken', 'Tajemné chutě', '怪味鸡块', 'Strange-Flavor Chicken', 'Kuřecí kousky', cat_id, 179, 'kitchen', 'food', true, false, 2, 2, NULL),
  ('Honey Chicken', 'Na medu', '蜜汁鸡块', 'Honey Chicken', 'Kuřecí kousky', cat_id, 179, 'kitchen', 'food', true, false, 3, 3, NULL);

  SELECT id INTO cat_id FROM public.categories WHERE lower(trim(name)) = lower(trim('Speciality')) LIMIT 1;
  IF cat_id IS NULL THEN
    RAISE EXCEPTION 'Category not found: Speciality';
  END IF;
  INSERT INTO public.menu_items (
    name_en, name_cz, name_zh, name, category, category_id, price,
    station, item_type, is_available, sold_out, sort_order, display_order, customization_config
  ) VALUES
  ('Eight Treasures (Mixed Meat)', 'Osm pokladů · mix masa', '八宝肉', 'Eight Treasures (Mixed Meat)', 'Speciality', cat_id, 199, 'kitchen', 'food', true, false, 1, 1, NULL),
  ('Hunan Style Chicken', 'Hunan · kuřecí', '湖南鸡', 'Hunan Style Chicken', 'Speciality', cat_id, 179, 'kitchen', 'food', true, false, 2, 2, NULL);

  RAISE NOTICE 'Lunch menu seeded: % items in % categories', 59, 7;
END $$;
