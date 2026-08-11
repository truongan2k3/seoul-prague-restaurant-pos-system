-- Kitchen tickets printed by Windows /print-station tab (not by phone/tablet)
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS kitchen_print_via_station BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.settings.kitchen_print_via_station IS
  'When true, Send/Message kitchen only queues jobs; Windows Print Station tab prints via local bridge';
