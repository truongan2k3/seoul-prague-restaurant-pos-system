-- Table guest requests from fixed QR pages (/table/<uuid>).
-- Run in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.table_guest_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
  table_label text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('call_staff', 'banchan', 'grill_change', 'payment')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  completed_by text
);

CREATE INDEX IF NOT EXISTS table_guest_requests_pending_idx
  ON public.table_guest_requests (status, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS table_guest_requests_table_idx
  ON public.table_guest_requests (table_id, created_at DESC);

ALTER TABLE public.table_guest_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "table_guest_requests_anon_all" ON public.table_guest_requests;
CREATE POLICY "table_guest_requests_anon_all"
  ON public.table_guest_requests
  FOR ALL
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'table_guest_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.table_guest_requests;
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END $$;
