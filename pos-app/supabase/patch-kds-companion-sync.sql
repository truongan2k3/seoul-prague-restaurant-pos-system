BEGIN;
CREATE TABLE IF NOT EXISTS public.kds_companion_states (
  parent_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  companion_id text NOT NULL CHECK (companion_id IN ('banchan','lettuce','garlic','leek','charcoal')),
  completed_at timestamptz,
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_item_id, companion_id)
);
ALTER TABLE public.kds_companion_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kds_companion_visible_parent ON public.kds_companion_states;
CREATE POLICY kds_companion_visible_parent ON public.kds_companion_states
  FOR ALL TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.id=parent_item_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.id=parent_item_id));
GRANT SELECT,INSERT,UPDATE ON public.kds_companion_states TO anon,authenticated;

-- Same permissions as the visible parent order; an already-completed side keeps its timestamp.
CREATE OR REPLACE FUNCTION public.set_grill_companion_states(p_changes jsonb)
RETURNS SETOF public.kds_companion_states
LANGUAGE sql SET search_path=public,pg_temp AS $$
  INSERT INTO public.kds_companion_states(parent_item_id,companion_id,completed_at)
  SELECT x.parent_item_id,x.companion_id,x.completed_at
  FROM jsonb_to_recordset(p_changes) x(parent_item_id uuid,companion_id text,completed_at timestamptz)
  ON CONFLICT(parent_item_id,companion_id) DO UPDATE SET
    completed_at=CASE WHEN EXCLUDED.completed_at IS NULL THEN NULL
      ELSE coalesce(kds_companion_states.completed_at,EXCLUDED.completed_at) END,
    changed_at=clock_timestamp()
  RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.set_grill_companion_states(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_grill_companion_states(jsonb) TO anon,authenticated,service_role;
ALTER TABLE public.kds_companion_states REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND
    NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='kds_companion_states') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.kds_companion_states;
  END IF;
END $$;
COMMIT;
