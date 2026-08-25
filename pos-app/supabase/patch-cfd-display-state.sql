-- Durable CFD checkout state so /client can recover if broadcast is missed
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS public.cfd_display_state (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  client_state text NOT NULL DEFAULT 'idle'
    CHECK (client_state IN ('idle', 'checkout', 'thankyou')),
  checkout_payload jsonb,
  thank_you_table text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.cfd_display_state (id, client_state)
VALUES (1, 'idle')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.cfd_display_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cfd_display_state_anon_all" ON public.cfd_display_state;
CREATE POLICY "cfd_display_state_anon_all" ON public.cfd_display_state
  FOR ALL USING (true) WITH CHECK (true);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.cfd_display_state;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

NOTIFY pgrst, 'reload schema';
