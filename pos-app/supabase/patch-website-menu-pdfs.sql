-- PDF menu books for landing page (Czech, English, Chinese)

create table if not exists public.website_menu_pdfs (
  id uuid primary key default gen_random_uuid(),
  language text not null unique check (language in ('cs', 'en', 'zh')),
  label text not null,
  file_url text not null,
  storage_path text,
  page_count int,
  file_size bigint,
  updated_at timestamptz not null default now()
);

alter table public.website_menu_pdfs enable row level security;

drop policy if exists "website_menu_pdfs_public_read" on public.website_menu_pdfs;
create policy "website_menu_pdfs_public_read" on public.website_menu_pdfs for select using (true);

-- Ensure marketing media bucket exists (also created in patch-website-cms.sql).
insert into storage.buckets (id, name, public)
values ('restaurant_media', 'restaurant_media', true)
on conflict (id) do update set public = true;

drop policy if exists "restaurant_media_public_read" on storage.objects;
create policy "restaurant_media_public_read" on storage.objects
  for select using (bucket_id = 'restaurant_media');

