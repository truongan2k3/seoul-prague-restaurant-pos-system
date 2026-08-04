-- Customer display: ad video + review QR settings + media bucket
-- Safe to re-run.

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS cfd_ad_video_url text NOT NULL DEFAULT '';

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS cfd_review_url text NOT NULL DEFAULT 'https://www.google.com/maps/search/?api=1&query=Seoul+Prague+Restaurant';

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS cfd_review_qr_image_url text NOT NULL DEFAULT '';

INSERT INTO storage.buckets (id, name, public)
VALUES ('cfd_media', 'cfd_media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "cfd_media_public_read" ON storage.objects;
CREATE POLICY "cfd_media_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'cfd_media');

DROP POLICY IF EXISTS "cfd_media_anon_upload" ON storage.objects;
CREATE POLICY "cfd_media_anon_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'cfd_media');

DROP POLICY IF EXISTS "cfd_media_anon_update" ON storage.objects;
CREATE POLICY "cfd_media_anon_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'cfd_media');
