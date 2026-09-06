-- Remove website CMS videos (landing promo / hero video feature retired).
-- Safe to re-run.

drop policy if exists "website_videos_public_read" on public.website_videos;
drop table if exists public.website_videos;

-- Clear leftover hero_video media slot rows if present.
delete from public.website_media_assets where slot = 'hero_video';
