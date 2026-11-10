-- Metadata-only preflight for the existing restaurant database.
-- Does not read guest/payment rows, create objects, change settings, or activate EET.
-- Check the backup separately before applying the versioned migration.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '2s';

WITH required(table_name, column_name) AS (
  VALUES ('businesses','id'),
    ('staff','id'),('staff','business_id'),('staff','active'),
    ('tables','id'),('tables','occupied_at'),('tables','status'),('tables','payment_status'),
    ('sales','id'),('sales','staff_id'),('sales','table_id'),('sales','subtotal'),
    ('sales','discount_amount'),('sales','tip'),('sales','grand_total'),
    ('sales','payment_method'),('sales','items'),('sales','closed_at'),
    ('sales','deleted_at'),('sales','seated_at'),('sales','referral_code_id'),
    ('sales','referral_actor_id'),('sales','referral_actor_name'),('sales','referral_adjustment_reason')
)
SELECT r.table_name, r.column_name AS missing_required_column
FROM required r LEFT JOIN information_schema.columns c
  ON c.table_schema='public' AND c.table_name=r.table_name AND c.column_name=r.column_name
WHERE c.column_name IS NULL ORDER BY r.table_name,r.column_name;

SELECT name AS eet_object, to_regclass('public.'||name) IS NOT NULL AS already_exists
FROM unnest(ARRAY['eet_settings','eet_transactions','eet_attempts','eet_audit_logs']) name;

SELECT c.relname AS table_name,c.relrowsecurity AS rls_enabled,p.polname AS policy_name,
  p.polcmd AS operation,pg_get_expr(p.polqual,p.polrelid)='true' AS unrestricted_using,
  pg_get_expr(p.polwithcheck,p.polrelid)='true' AS unrestricted_check
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid=c.oid
WHERE n.nspname='public' AND c.relname IN ('business_accounts','staff','sales','tables')
ORDER BY c.relname,p.polname;

SELECT c.relname AS table_name,t.tgname AS trigger_name,p.proname AS trigger_function
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
WHERE n.nspname='public' AND c.relname IN ('sales','tables') AND NOT t.tgisinternal
ORDER BY c.relname,t.tgname;

SELECT required_role, EXISTS(SELECT 1 FROM pg_roles WHERE rolname=required_role) AS available
FROM unnest(ARRAY['anon','authenticated','service_role']) required_role;
SELECT to_regprocedure('auth.role()') IS NOT NULL AS supabase_auth_role_function_available;

ROLLBACK;
