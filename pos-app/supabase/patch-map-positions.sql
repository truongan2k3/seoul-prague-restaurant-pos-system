-- Free map layout: absolute x/y coordinates for table cards

ALTER TABLE public.tables
  ADD COLUMN IF NOT EXISTS pos_x numeric,
  ADD COLUMN IF NOT EXISTS pos_y numeric;
