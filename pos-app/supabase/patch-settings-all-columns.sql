-- patch-settings-all-columns.sql
-- Run once in Supabase → SQL Editor if settings save fails with "column not found".
-- Safe to re-run (uses IF NOT EXISTS).

-- Base table (skip if you already ran patch-settings.sql)
CREATE TABLE IF NOT EXISTS public.settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  printer_ip text NOT NULL DEFAULT '192.168.1.200',
  printer_port text NOT NULL DEFAULT '9100',
  auto_print_on_payment boolean NOT NULL DEFAULT true,
  receipt_header_title text NOT NULL DEFAULT 'SEOUL PRAGUE',
  receipt_address text NOT NULL DEFAULT 'Václavské nám. 819/43, Praha',
  receipt_phone text NOT NULL DEFAULT '+420 222 240 429',
  receipt_tax_id text NOT NULL DEFAULT 'CZ12345678',
  receipt_footer_note text NOT NULL DEFAULT 'Thank you! Děkujeme! 谢谢光临!',
  custom_alert_sound_url text NOT NULL DEFAULT '/sounds/default-bell.mp3',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Czech receipt fields
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS receipt_legal_name text DEFAULT 'JING DE INTER.TRADE, s.r.o.';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS receipt_company_address text DEFAULT 'Václavské náměstí 819/43, 110 00 Praha';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS receipt_ico text DEFAULT '25682199';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS receipt_dic text DEFAULT 'CZ25682199';

-- Display & currency
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS show_prices_on_order_screen boolean DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS enable_price_rounding boolean DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS show_eur_currency boolean DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS eur_exchange_rate numeric DEFAULT 25.0;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS menu_item_layout text DEFAULT 'vertical';

-- Reservations
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS reservation_time_step int DEFAULT 30;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS reservation_max_guests_per_slot int DEFAULT 20;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS reservation_table_holding_time int DEFAULT 90;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS reservation_operating_hours jsonb DEFAULT '{
  "monday": {"enabled": true, "open": "11:00", "close": "22:00"},
  "tuesday": {"enabled": true, "open": "11:00", "close": "22:00"},
  "wednesday": {"enabled": true, "open": "11:00", "close": "22:00"},
  "thursday": {"enabled": true, "open": "11:00", "close": "22:00"},
  "friday": {"enabled": true, "open": "11:00", "close": "23:00"},
  "saturday": {"enabled": true, "open": "11:00", "close": "23:00"},
  "sunday": {"enabled": true, "open": "11:00", "close": "22:00"}
}'::jsonb;

-- Receipt font (fixes: receipt_font_family not in schema cache)
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS receipt_font_size text DEFAULT 'medium';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS receipt_font_weight text DEFAULT 'bold';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS receipt_font_family text DEFAULT 'consolas';

-- Admin + card terminal
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS admin_deletion_password text DEFAULT '1234';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS terminal_type text DEFAULT 'network';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS terminal_ip text DEFAULT '192.168.1.105';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS terminal_port text DEFAULT '2000';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS terminal_pos_id text DEFAULT 'PVTL9664';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS terminal_connection_mode text DEFAULT 'inbound';

-- Customer display (CFD)
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS cfd_ad_video_url text DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS cfd_review_url text DEFAULT 'https://www.google.com/maps/search/?api=1&query=Seoul+Prague+Restaurant';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS cfd_review_qr_image_url text DEFAULT '';

-- Announcement marquee (main POS tabs)
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS marquee_enabled boolean DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS marquee_text text DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS marquee_duration_seconds int DEFAULT 28;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS marquee_font_family text DEFAULT 'arial';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS marquee_end_at timestamptz DEFAULT NULL;

-- RLS (anon POS access)
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings_anon_all" ON public.settings;
CREATE POLICY "settings_anon_all" ON public.settings FOR ALL USING (true) WITH CHECK (true);

-- Notify PostgREST to pick up new columns (Supabase)
NOTIFY pgrst, 'reload schema';
