-- Storage: menu sort modes + customer display slideshow (multi media).
-- Safe to re-run.

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS menu_category_sort_mode text NOT NULL DEFAULT 'custom';

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS menu_item_sort_mode text NOT NULL DEFAULT 'custom';

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS cfd_ad_slideshow jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_menu_category_sort_mode_check;
ALTER TABLE public.settings
  ADD CONSTRAINT settings_menu_category_sort_mode_check
  CHECK (menu_category_sort_mode IN ('custom', 'alphabetical'));

ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_menu_item_sort_mode_check;
ALTER TABLE public.settings
  ADD CONSTRAINT settings_menu_item_sort_mode_check
  CHECK (menu_item_sort_mode IN ('custom', 'alphabetical'));

COMMENT ON COLUMN public.settings.menu_category_sort_mode IS
  'custom = drag order on order screen; alphabetical = A–Z by category name';

COMMENT ON COLUMN public.settings.menu_item_sort_mode IS
  'custom = drag order in Storage; alphabetical = A–Z by English name within category';

COMMENT ON COLUMN public.settings.cfd_ad_slideshow IS
  'Ordered idle media for /client: [{ id, url, type, durationSeconds? }] — images default 12s';
