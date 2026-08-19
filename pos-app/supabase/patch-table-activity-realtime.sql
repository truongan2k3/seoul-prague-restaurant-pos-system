-- Enable Realtime for table activity logs (main POS new-order alerts).
-- Safe to re-run.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.table_activity_logs;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
