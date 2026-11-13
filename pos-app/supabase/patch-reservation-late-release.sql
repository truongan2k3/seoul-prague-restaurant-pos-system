-- Late reservations keep their record and planned table labels, but no longer
-- retain capacity. Apply once after the existing reservation/check-in patches.
-- Re-runnable. No table data, assignments, statuses, grants or RLS are changed.
BEGIN;

DO $patch$
DECLARE fn record; original text; revised text;
BEGIN
  IF to_regprocedure('public.single_reservation_table_guard()') IS NULL THEN
    RAISE EXCEPTION 'Reservation table guard is missing. Install the existing reservation assignment patches first.';
  END IF;
  -- Preserve the deployed versions' security, override scopes and locking rules
  -- instead of replacing them with an older copy of a check-in function.
  FOR fn IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN
      ('single_reservation_table_guard', 'check_in_single_reservation', 'check_in_reservation_tables')
  LOOP
    original := pg_get_functiondef(fn.oid);
    IF fn.proname = 'single_reservation_table_guard' THEN
      -- Late writes bypass the hold guard; reactivating Late must run it again.
      revised := regexp_replace(original, $rx$,[[:space:]]*'late'$rx$, '', 'gi');
    ELSE
      -- b is the competing booking, not the arriving guest (r). Arriving Late
      -- guests remain eligible for check-in, with all occupancy checks intact.
      revised := regexp_replace(original,
        $rx$(\mb\.status[[:space:]]+IN[[:space:]]*\([^)]*),[[:space:]]*'late'$rx$, '\1', 'gi');
    END IF;
    IF revised IS DISTINCT FROM original THEN EXECUTE revised; END IF;
  END LOOP;
END;
$patch$;

NOTIFY pgrst, 'reload schema';
COMMIT;
