-- Reservation page cinematic background (video/poster + overlay).
-- Safe to re-run.

alter table public.website_settings
  add column if not exists reservation_background jsonb not null default '{}'::jsonb;

comment on column public.website_settings.reservation_background is
  'Guest /reservation page background: video/poster URLs, overlay, crop positions.';
