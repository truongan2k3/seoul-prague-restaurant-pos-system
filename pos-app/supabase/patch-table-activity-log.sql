-- Staff-facing activity log per table session (send, save, notes, checkout).
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.table_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid REFERENCES public.tables(id) ON DELETE SET NULL,
  table_label text,
  order_item_id uuid,
  item_name text,
  action text NOT NULL,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  staff_name text NOT NULL DEFAULT 'Staff',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS table_activity_logs_table_id_created_at_idx
  ON public.table_activity_logs (table_id, created_at);

ALTER TABLE public.table_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "table_activity_logs_all" ON public.table_activity_logs;
CREATE POLICY "table_activity_logs_all" ON public.table_activity_logs
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.table_activity_logs IS
  'POS staff actions: sent_to_kitchen, save_no_print, add_note, checkout, cancel_item';
