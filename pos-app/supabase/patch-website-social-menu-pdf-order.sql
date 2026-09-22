-- Social links (flexible platforms) + menu PDF sort order
-- Safe to re-run.

alter table public.website_settings
  add column if not exists social_links jsonb not null default '[]'::jsonb;

comment on column public.website_settings.social_links is
  'Ordered social platforms [{id, platform, url, sortOrder}] for Visit Us / footer.';

alter table public.website_menu_pdfs
  add column if not exists sort_order int not null default 0;

comment on column public.website_menu_pdfs.sort_order is
  'Admin drag order. When all rows are 0, English is shown first by default.';
