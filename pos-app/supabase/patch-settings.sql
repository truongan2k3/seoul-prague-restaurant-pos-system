-- Settings table + audio_alerts storage bucket
-- Safe to re-run.

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

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings_anon_all" ON public.settings;
CREATE POLICY "settings_anon_all" ON public.settings FOR ALL USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('audio_alerts', 'audio_alerts', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "audio_alerts_public_read" ON storage.objects;
CREATE POLICY "audio_alerts_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'audio_alerts');

DROP POLICY IF EXISTS "audio_alerts_anon_upload" ON storage.objects;
CREATE POLICY "audio_alerts_anon_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'audio_alerts');

DROP POLICY IF EXISTS "audio_alerts_anon_update" ON storage.objects;
CREATE POLICY "audio_alerts_anon_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'audio_alerts');

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.settings;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;
