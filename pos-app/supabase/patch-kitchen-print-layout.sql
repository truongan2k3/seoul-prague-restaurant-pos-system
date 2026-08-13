-- Per-element layout for kitchen order and message tickets (JSON).
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS kitchen_print_layout JSONB;

COMMENT ON COLUMN public.settings.kitchen_print_layout IS
  'Kitchen ticket layout: orderTicket + messageTicket element show/align/sizeScale/order (null = defaults)';
