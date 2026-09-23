-- Allow guest chat sessions from /voucher and store sidebar nav visibility.
-- Safe to re-run.

ALTER TABLE public.guest_chat_sessions DROP CONSTRAINT IF EXISTS guest_chat_sessions_page_check;
ALTER TABLE public.guest_chat_sessions
  ADD CONSTRAINT guest_chat_sessions_page_check
  CHECK (page IN ('landing', 'reservation', 'voucher', 'other'));

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS sidebar_nav_hidden jsonb NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
