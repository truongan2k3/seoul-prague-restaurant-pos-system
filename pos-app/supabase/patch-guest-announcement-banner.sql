-- Temporary guest announcement banner (landing / reservation top bar).
-- Run in Supabase SQL editor.

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS guest_announcement_banner jsonb NOT NULL DEFAULT '{
    "enabled": false,
    "title": { "en": "", "cs": "", "vi": "", "de": "", "ko": "" },
    "message": { "en": "", "cs": "", "vi": "", "de": "", "ko": "" },
    "startAt": "",
    "endAt": "",
    "showOnLanding": true,
    "showOnReservation": true
  }'::jsonb;

COMMENT ON COLUMN public.settings.guest_announcement_banner IS
  'Guest site announcement bar: enabled, title/message per lang, startAt/endAt, showOnLanding, showOnReservation';

NOTIFY pgrst, 'reload schema';
