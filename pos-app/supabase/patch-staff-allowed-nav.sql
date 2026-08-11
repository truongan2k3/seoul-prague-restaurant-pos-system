-- Per-staff POS tab permissions (empty/null = use role defaults)
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS allowed_nav text[] DEFAULT NULL;

COMMENT ON COLUMN public.staff.allowed_nav IS
  'Nav tabs this member may see (map, order, reservations, history, summary, storage, staff, settings). NULL/empty = role defaults.';
