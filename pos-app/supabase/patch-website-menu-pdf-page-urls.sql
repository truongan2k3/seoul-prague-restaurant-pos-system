-- Pre-rendered JPEG page URLs for menu flipbook (avoids downloading full PDF for guests).

alter table public.website_menu_pdfs
  add column if not exists page_urls jsonb not null default '[]'::jsonb;

comment on column public.website_menu_pdfs.page_urls is
  'Public JPEG URLs for each PDF page, in order. Flipbook prefers these over the PDF file.';
