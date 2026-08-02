-- Run in Supabase Dashboard → SQL Editor
-- WARNING: This drops and recreates tables (deletes existing rows).
-- Safe to run if your tables are empty or you want a fresh start.

DROP TABLE IF EXISTS public.tables;
DROP TABLE IF EXISTS public.menu_items;

-- ── Schema (matches the Next.js app) ────────────────────────────────────────

CREATE TABLE public.tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  type text NOT NULL CHECK (type IN ('regular', 'special')),
  status text NOT NULL CHECK (status IN ('empty', 'occupied')),
  grid_column text NOT NULL,
  grid_row text NOT NULL,
  occupied_at timestamptz,
  orders jsonb
);

CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric(10, 2) NOT NULL,
  category text NOT NULL CHECK (category IN ('Hotpot', 'Meat', 'Drinks'))
);

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read on tables"
ON public.tables FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Allow update on tables"
ON public.tables FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow read on menu_items"
ON public.menu_items FOR SELECT TO anon, authenticated USING (true);

-- ── Menu items ──────────────────────────────────────────────────────────────

INSERT INTO public.menu_items (id, name, price, category) VALUES
  ('10000000-0000-4000-a000-000000000001'::uuid, 'Spicy beef hotpot', 18.50, 'Hotpot'),
  ('10000000-0000-4000-a000-000000000002'::uuid, 'Mushroom hotpot', 14.00, 'Hotpot'),
  ('10000000-0000-4000-a000-000000000003'::uuid, 'Tomato hotpot', 12.50, 'Hotpot'),
  ('10000000-0000-4000-a000-000000000004'::uuid, 'Chicken burger', 9.50, 'Meat'),
  ('10000000-0000-4000-a000-000000000005'::uuid, 'Beef steak', 22.00, 'Meat'),
  ('10000000-0000-4000-a000-000000000006'::uuid, 'Pork ribs', 16.50, 'Meat'),
  ('10000000-0000-4000-a000-000000000007'::uuid, 'Rice noodle', 6.50, 'Meat'),
  ('10000000-0000-4000-a000-000000000008'::uuid, 'Sparkling water', 2.50, 'Drinks'),
  ('10000000-0000-4000-a000-000000000009'::uuid, 'Lemonade', 3.00, 'Drinks'),
  ('10000000-0000-4000-a000-000000000010'::uuid, 'White wine', 8.00, 'Drinks'),
  ('10000000-0000-4000-a000-000000000011'::uuid, 'Red wine', 9.50, 'Drinks');

-- ── Restaurant tables ─────────────────────────────────────────────────────────

INSERT INTO public.tables (id, label, type, status, grid_column, grid_row, occupied_at, orders) VALUES
  ('20000000-0000-4000-a000-000000000001'::uuid, '1', 'regular', 'empty', '1', '1', NULL, NULL),
  ('20000000-0000-4000-a000-000000000002'::uuid, '2', 'regular', 'occupied', '2', '1', now() - interval '80 seconds',
    '[{"name":"Chicken burger","quantity":1,"price":9.5},{"name":"Rice noodle","quantity":2,"price":6.5}]'::jsonb),
  ('20000000-0000-4000-a000-000000000003'::uuid, '3', 'regular', 'empty', '3', '1', NULL, NULL),
  ('20000000-0000-4000-a000-000000000004'::uuid, '4', 'regular', 'occupied', '4', '1', now() - interval '45 seconds',
    '[{"name":"Caesar salad","quantity":1,"price":8.0}]'::jsonb),
  ('20000000-0000-4000-a000-000000000101'::uuid, 'S1', 'special', 'occupied', '6', '1 / span 2', now() - interval '7 minutes 20 seconds',
    '[{"name":"Seafood platter","quantity":1,"price":28.0},{"name":"White wine","quantity":2,"price":8.0},{"name":"Tiramisu","quantity":1,"price":7.5}]'::jsonb),
  ('20000000-0000-4000-a000-000000000005'::uuid, '5', 'regular', 'empty', '1', '2', NULL, NULL),
  ('20000000-0000-4000-a000-000000000006'::uuid, '6', 'regular', 'occupied', '2', '2', now() - interval '3 minutes',
    '[{"name":"Margherita pizza","quantity":2,"price":11.0},{"name":"Sparkling water","quantity":1,"price":2.5}]'::jsonb),
  ('20000000-0000-4000-a000-000000000007'::uuid, '7', 'regular', 'empty', '3', '2', NULL, NULL),
  ('20000000-0000-4000-a000-000000000008'::uuid, '8', 'regular', 'empty', '4', '2', NULL, NULL),
  ('20000000-0000-4000-a000-000000000102'::uuid, 'S2', 'special', 'empty', '6', '3', NULL, NULL),
  ('20000000-0000-4000-a000-000000000009'::uuid, '9', 'regular', 'occupied', '1', '3', now() - interval '12 minutes',
    '[{"name":"Beef steak","quantity":2,"price":22.0}]'::jsonb),
  ('20000000-0000-4000-a000-000000000010'::uuid, '10', 'regular', 'empty', '2', '3', NULL, NULL),
  ('20000000-0000-4000-a000-000000000011'::uuid, '11', 'regular', 'empty', '3', '3', NULL, NULL),
  ('20000000-0000-4000-a000-000000000012'::uuid, '12', 'regular', 'occupied', '4', '3', now() - interval '5 minutes 30 seconds',
    '[{"name":"Fish & chips","quantity":1,"price":13.5},{"name":"Lemonade","quantity":2,"price":3.0}]'::jsonb),
  ('20000000-0000-4000-a000-000000000013'::uuid, '13', 'regular', 'empty', '1', '4', NULL, NULL),
  ('20000000-0000-4000-a000-000000000014'::uuid, '14', 'regular', 'empty', '2', '4', NULL, NULL),
  ('20000000-0000-4000-a000-000000000015'::uuid, '15', 'regular', 'occupied', '3 / span 2', '4', now() - interval '22 minutes',
    '[{"name":"Pasta carbonara","quantity":3,"price":12.0},{"name":"Garlic bread","quantity":2,"price":4.5},{"name":"Red wine","quantity":1,"price":9.5}]'::jsonb);
