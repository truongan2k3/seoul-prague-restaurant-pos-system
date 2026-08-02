-- Czech tax-compliant receipt settings columns
-- Run in Supabase SQL editor after patch-settings.sql

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS receipt_legal_name text NOT NULL DEFAULT 'JING DE INTER.TRADE, s.r.o.',
  ADD COLUMN IF NOT EXISTS receipt_company_address text NOT NULL DEFAULT 'Václavské náměstí 819/43, 110 00 Praha',
  ADD COLUMN IF NOT EXISTS receipt_ico text NOT NULL DEFAULT '25682199',
  ADD COLUMN IF NOT EXISTS receipt_dic text NOT NULL DEFAULT 'CZ25682199';

UPDATE public.settings SET
  receipt_header_title = 'JIN CHENG',
  receipt_address = 'Václavské nám. 819, 110 00 Praha',
  receipt_legal_name = COALESCE(receipt_legal_name, 'JING DE INTER.TRADE, s.r.o.'),
  receipt_company_address = COALESCE(receipt_company_address, 'Václavské náměstí 819/43, 110 00 Praha'),
  receipt_ico = COALESCE(receipt_ico, '25682199'),
  receipt_dic = COALESCE(receipt_dic, 'CZ25682199'),
  receipt_footer_note = 'Děkujeme za Vaši návštěvu!' || E'\n' || 'Otevírací doba: Po-Ne 10:00-22:00'
WHERE id = 1;
