-- Per-section receipt font size multipliers (JSON).
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS receipt_section_sizes JSONB;

COMMENT ON COLUMN public.settings.receipt_section_sizes IS
  'Receipt section size scales: header/meta/items/totals/celkem/vat/footer (0.75|1|1.25|1.5; null = defaults)';
