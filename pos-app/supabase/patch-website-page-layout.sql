-- Homepage layout + event slideshows for visual designer
-- Safe to re-run.

alter table public.website_settings
  add column if not exists page_layout jsonb not null default '[]'::jsonb;

alter table public.website_settings
  add column if not exists promo_slideshows jsonb not null default '[]'::jsonb;

comment on column public.website_settings.page_layout is
  'Ordered homepage sections for /admin/designer (JSON array).';

comment on column public.website_settings.promo_slideshows is
  'Event / promo carousels referenced by promo_slideshow sections.';
