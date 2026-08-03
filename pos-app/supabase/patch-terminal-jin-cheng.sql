-- Jin Cheng / Desk 3200 — run FULL script in Supabase SQL Editor
-- Step 1: add columns (safe if already exist)
-- Step 2: set terminal values

ALTER TABLE settings ADD COLUMN IF NOT EXISTS admin_deletion_password text DEFAULT '1234';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS terminal_type text DEFAULT 'mock';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS terminal_ip text DEFAULT '192.168.1.100';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS terminal_port text DEFAULT '8080';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS terminal_pos_id text DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS terminal_connection_mode text DEFAULT 'inbound';

ALTER TABLE sales ADD COLUMN IF NOT EXISTS card_auth_code text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS card_last4 text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS card_brand text;

UPDATE settings
SET
  terminal_type = 'network',
  terminal_ip = '192.168.1.105',
  terminal_port = '2000',
  terminal_pos_id = 'PVTL9664',
  terminal_connection_mode = 'inbound',
  updated_at = now()
WHERE id = 1;
