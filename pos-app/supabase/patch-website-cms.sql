-- Premium restaurant website CMS (landing page + /admin)
-- Safe to run alongside existing POS/reservation tables.

create table if not exists public.website_settings (
  id int primary key default 1 check (id = 1),
  restaurant_name text,
  tagline text,
  description text,
  about_story text,
  phone text,
  email text,
  address text,
  google_maps_url text,
  hero_headline text,
  hero_tagline text,
  hero_description text,
  instagram_url text,
  facebook_url text,
  tiktok_url text,
  seo_title text,
  seo_description text,
  seo_og_image_url text,
  opening_hours jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.website_media_assets (
  id uuid primary key default gen_random_uuid(),
  slot text not null unique,
  file_url text not null,
  storage_path text,
  width int,
  height int,
  mime_type text,
  alt_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.website_amenities (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  icon text not null default 'sparkles',
  sort_order int not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.website_menu_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order int not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.website_menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.website_menu_categories(id) on delete set null,
  name text not null,
  description text,
  price numeric(10, 2),
  currency text not null default 'CZK',
  image_url text,
  featured boolean not null default false,
  available boolean not null default true,
  sort_order int not null default 0,
  badge text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.website_gallery_items (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'food',
  title text,
  image_url text not null,
  storage_path text,
  sort_order int not null default 0,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.website_videos (
  id uuid primary key default gen_random_uuid(),
  title text,
  description text,
  video_url text not null,
  poster_url text,
  slot text not null default 'promo',
  sort_order int not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Public read for marketing site; writes via service role in server actions.
alter table public.website_settings enable row level security;
alter table public.website_media_assets enable row level security;
alter table public.website_amenities enable row level security;
alter table public.website_menu_categories enable row level security;
alter table public.website_menu_items enable row level security;
alter table public.website_gallery_items enable row level security;
alter table public.website_videos enable row level security;

drop policy if exists "website_settings_public_read" on public.website_settings;
create policy "website_settings_public_read" on public.website_settings for select using (true);

drop policy if exists "website_media_public_read" on public.website_media_assets;
create policy "website_media_public_read" on public.website_media_assets for select using (true);

drop policy if exists "website_amenities_public_read" on public.website_amenities;
create policy "website_amenities_public_read" on public.website_amenities for select using (true);

drop policy if exists "website_menu_categories_public_read" on public.website_menu_categories;
create policy "website_menu_categories_public_read" on public.website_menu_categories for select using (true);

drop policy if exists "website_menu_items_public_read" on public.website_menu_items;
create policy "website_menu_items_public_read" on public.website_menu_items for select using (true);

drop policy if exists "website_gallery_public_read" on public.website_gallery_items;
create policy "website_gallery_public_read" on public.website_gallery_items for select using (true);

drop policy if exists "website_videos_public_read" on public.website_videos;
create policy "website_videos_public_read" on public.website_videos for select using (true);

-- Storage bucket for restaurant marketing media (public read).
insert into storage.buckets (id, name, public)
values ('restaurant_media', 'restaurant_media', true)
on conflict (id) do update set public = true;

drop policy if exists "restaurant_media_public_read" on storage.objects;
create policy "restaurant_media_public_read" on storage.objects
  for select using (bucket_id = 'restaurant_media');
