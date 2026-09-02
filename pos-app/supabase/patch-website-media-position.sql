-- Focal crop position for marketing images (visual editor drag-to-reposition).

ALTER TABLE public.website_media_assets
  ADD COLUMN IF NOT EXISTS object_position text DEFAULT '50% 50%';

COMMENT ON COLUMN public.website_media_assets.object_position IS
  'CSS object-position value, e.g. 50% 40% — set by visual designer drag.';
