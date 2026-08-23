-- Guest seated time on completed sales (table occupied_at at checkout).
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS seated_at timestamptz;

COMMENT ON COLUMN public.sales.seated_at IS 'When guests were seated (tables.occupied_at snapshot at checkout).';
