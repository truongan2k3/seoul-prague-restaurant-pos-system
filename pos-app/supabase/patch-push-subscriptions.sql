-- Push subscriptions for Web Push (reservation alerts when POS tab is closed)
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_updated_at_idx
  ON public.push_subscriptions (updated_at DESC);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Server uses service role; anon policies kept permissive like other POS tables.
DROP POLICY IF EXISTS "push_subscriptions_anon_all" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_anon_all"
  ON public.push_subscriptions
  FOR ALL
  USING (true)
  WITH CHECK (true);
