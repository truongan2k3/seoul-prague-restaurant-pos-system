-- Run this in Supabase Dashboard → SQL Editor
-- https://supabase.com/dashboard/project/_/sql

-- 1. Enable Row Level Security
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

-- 2. Read access (required for the app to load data)
CREATE POLICY "Allow read on tables"
ON public.tables
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow read on menu_items"
ON public.menu_items
FOR SELECT
TO anon, authenticated
USING (true);

-- 3. Update access (required for Send to Kitchen + Checkout)
CREATE POLICY "Allow update on tables"
ON public.tables
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Optional: if policies already exist with these names, drop them first:
-- DROP POLICY IF EXISTS "Allow read on tables" ON public.tables;
-- DROP POLICY IF EXISTS "Allow read on menu_items" ON public.menu_items;
-- DROP POLICY IF EXISTS "Allow update on tables" ON public.tables;
