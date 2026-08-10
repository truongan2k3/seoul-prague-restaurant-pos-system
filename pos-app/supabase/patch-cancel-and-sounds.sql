-- Soft-delete cancellations + sound_configs
-- Run in Supabase SQL Editor after patch-order-flow-addons.sql

-- 1. Cancellation tracking on order lines
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Expand kitchen_status for cancel / acknowledge flow
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_kitchen_status_check;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_kitchen_status_check
  CHECK (kitchen_status IN ('pending', 'ready', 'served', 'cancelled', 'archived'));

CREATE INDEX IF NOT EXISTS idx_order_items_is_cancelled
  ON public.order_items (is_cancelled)
  WHERE is_cancelled = true;

CREATE INDEX IF NOT EXISTS idx_order_items_kitchen_cancelled
  ON public.order_items (kitchen_status)
  WHERE kitchen_status IN ('cancelled', 'archived');

-- 2. Sound configurations on settings
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS sound_configs JSONB NOT NULL DEFAULT '{
    "call_waiter": "/sounds/bell.mp3",
    "new_order": "/sounds/new_order.mp3",
    "payment_success": "/sounds/success.mp3"
  }'::jsonb;

COMMENT ON COLUMN public.settings.sound_configs IS
  'POS/KDS sound map: call_waiter, new_order, payment_success (paths under /public/sounds)';

UPDATE public.settings
SET sound_configs = COALESCE(sound_configs, '{
  "call_waiter": "/sounds/bell.mp3",
  "new_order": "/sounds/new_order.mp3",
  "payment_success": "/sounds/success.mp3"
}'::jsonb)
WHERE sound_configs IS NULL;
