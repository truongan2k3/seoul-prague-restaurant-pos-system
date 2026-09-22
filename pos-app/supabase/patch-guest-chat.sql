-- Guest "Chat With Us" sessions + messages.
-- Run in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.guest_chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_client_id text NOT NULL,
  page text NOT NULL DEFAULT 'landing'
    CHECK (page IN ('landing', 'reservation', 'other')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'waiting', 'replied', 'follow_up', 'resolved', 'closed')),
  guest_name text,
  guest_email text,
  guest_phone text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_guest_message_at timestamptz,
  last_staff_message_at timestamptz,
  unread_by_staff boolean NOT NULL DEFAULT false,
  follow_up_offered_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guest_chat_sessions_client_idx
  ON public.guest_chat_sessions (guest_client_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS guest_chat_sessions_inbox_idx
  ON public.guest_chat_sessions (status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS guest_chat_sessions_unread_idx
  ON public.guest_chat_sessions (unread_by_staff, last_message_at DESC)
  WHERE unread_by_staff = true;

CREATE TABLE IF NOT EXISTS public.guest_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.guest_chat_sessions(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('guest', 'staff', 'system')),
  body text NOT NULL,
  staff_id text,
  staff_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guest_chat_messages_session_idx
  ON public.guest_chat_messages (session_id, created_at ASC);

ALTER TABLE public.guest_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guest_chat_sessions_anon_all" ON public.guest_chat_sessions;
CREATE POLICY "guest_chat_sessions_anon_all"
  ON public.guest_chat_sessions
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "guest_chat_messages_anon_all" ON public.guest_chat_messages;
CREATE POLICY "guest_chat_messages_anon_all"
  ON public.guest_chat_messages
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Chat settings JSON on settings row
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS guest_chat_config jsonb NOT NULL DEFAULT '{
    "enabled": true,
    "welcomeMessage": "Hello! How can we help you today?",
    "offlineMessage": "Our team is currently unavailable. Would you like us to contact you?",
    "unansweredMinutes": 5,
    "onlineDuringBusinessHours": true,
    "autoArchiveHours": 72
  }'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'guest_chat_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.guest_chat_sessions;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'guest_chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.guest_chat_messages;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;
