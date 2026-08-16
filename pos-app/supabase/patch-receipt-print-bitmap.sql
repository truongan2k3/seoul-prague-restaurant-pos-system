-- Bitmap receipt mode for legacy thermal printers (garbled font fix)
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS receipt_print_bitmap boolean DEFAULT false;
