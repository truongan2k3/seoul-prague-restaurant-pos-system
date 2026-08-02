-- Online reservation schema (reference / greenfield setup)
-- The POS app uses supabase/patch-reservations.sql with mapped columns:
--   guest_phone -> phone, guest_email -> email, party_size -> guest_count,
--   reserved_at (timestamptz) -> reservation_date + reservation_time combined.
-- Run supabase/patch-reservations-late.sql on existing installs to add 'late' status.

CREATE TABLE IF NOT EXISTS reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  guest_name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL,
  guest_count INT NOT NULL DEFAULT 2,
  reservation_date DATE NOT NULL,
  reservation_time TIME NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'confirmed', 'checked_in', 'no_show', 'late'
  assigned_table_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
