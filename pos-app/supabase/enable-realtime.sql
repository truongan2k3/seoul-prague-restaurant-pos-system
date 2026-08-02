-- Enable Supabase Realtime for the tables table.
-- Run in Supabase Dashboard → SQL Editor (once).

ALTER PUBLICATION supabase_realtime ADD TABLE public.tables;
