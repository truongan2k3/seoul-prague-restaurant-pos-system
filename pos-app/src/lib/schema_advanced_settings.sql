-- Advanced display, currency, and reservation slot settings (single-row settings table, id = 1)
-- Run in Supabase SQL editor after base settings migration.

ALTER TABLE settings ADD COLUMN IF NOT EXISTS show_prices_on_order_screen BOOLEAN DEFAULT true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS enable_price_rounding BOOLEAN DEFAULT true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS show_eur_currency BOOLEAN DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS eur_exchange_rate NUMERIC DEFAULT 25.0;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS reservation_time_step INT DEFAULT 30;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS reservation_max_guests_per_slot INT DEFAULT 20;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS reservation_table_holding_time INT DEFAULT 90;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS map_reservation_ticker_seconds INT DEFAULT 6;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS reservation_operating_hours JSONB DEFAULT '{
  "monday": {"enabled": true, "open": "11:00", "close": "22:00"},
  "tuesday": {"enabled": true, "open": "11:00", "close": "22:00"},
  "wednesday": {"enabled": true, "open": "11:00", "close": "22:00"},
  "thursday": {"enabled": true, "open": "11:00", "close": "22:00"},
  "friday": {"enabled": true, "open": "11:00", "close": "23:00"},
  "saturday": {"enabled": true, "open": "11:00", "close": "23:00"},
  "sunday": {"enabled": true, "open": "11:00", "close": "22:00"}
}'::jsonb;
