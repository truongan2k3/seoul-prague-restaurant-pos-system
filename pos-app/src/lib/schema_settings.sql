-- App settings (single-row configuration)
-- Run supabase/patch-settings.sql then patch-settings-czech-receipt.sql

CREATE TABLE IF NOT EXISTS settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  printer_ip TEXT NOT NULL DEFAULT '192.168.1.200',
  printer_port TEXT NOT NULL DEFAULT '9100',
  auto_print_on_payment BOOLEAN NOT NULL DEFAULT true,
  receipt_header_title TEXT NOT NULL DEFAULT 'JIN CHENG',
  receipt_legal_name TEXT NOT NULL DEFAULT 'JING DE INTER.TRADE, s.r.o.',
  receipt_address TEXT NOT NULL DEFAULT 'Václavské nám. 819, 110 00 Praha',
  receipt_company_address TEXT NOT NULL DEFAULT 'Václavské náměstí 819/43, 110 00 Praha',
  receipt_ico TEXT NOT NULL DEFAULT '25682199',
  receipt_dic TEXT NOT NULL DEFAULT 'CZ25682199',
  receipt_phone TEXT NOT NULL DEFAULT '+420 222 240 429',
  receipt_footer_note TEXT NOT NULL DEFAULT 'Děkujeme za Vaši návštěvu!
Otevírací doba: Po-Ne 10:00-22:00',
  custom_alert_sound_url TEXT NOT NULL DEFAULT '/sounds/default-bell.mp3',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
