-- Card terminal integration + admin deletion password
-- Run in Supabase SQL Editor

ALTER TABLE settings ADD COLUMN IF NOT EXISTS admin_deletion_password text DEFAULT '8888';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS terminal_type text DEFAULT 'mock';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS terminal_ip text DEFAULT '192.168.1.100';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS terminal_port text DEFAULT '8080';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS terminal_pos_id text DEFAULT '';

ALTER TABLE sales ADD COLUMN IF NOT EXISTS card_auth_code text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS card_last4 text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS card_brand text;
