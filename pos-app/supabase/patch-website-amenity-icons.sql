-- Amenity custom PNG icons (run in Supabase SQL editor)
alter table public.website_amenities
  add column if not exists icon_url text;
