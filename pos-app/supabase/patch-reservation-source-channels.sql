-- Allow phone_call / online booking sources alongside legacy reservation + walk_in.
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_source_check;
ALTER TABLE reservations
  ADD CONSTRAINT reservations_source_check
  CHECK (source IN ('reservation', 'walk_in', 'phone_call', 'online'));

ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_visit_source_check;
-- visit_source check may have been created inline; recreate if present via column recreate is heavy —
-- drop any check that references visit_source values, then add a permissive one.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'visit_source'
  ) THEN
    BEGIN
      ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_visit_source_check;
    EXCEPTION WHEN undefined_object THEN
      NULL;
    END;
  END IF;
END $$;
