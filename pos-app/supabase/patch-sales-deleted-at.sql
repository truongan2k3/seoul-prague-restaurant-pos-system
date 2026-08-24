-- Soft-delete sales so History can show voided orders instead of removing them.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS sales_deleted_at_idx ON public.sales (deleted_at);

COMMENT ON COLUMN public.sales.deleted_at IS 'When set, sale is voided in History (kept for audit, excluded from revenue).';
