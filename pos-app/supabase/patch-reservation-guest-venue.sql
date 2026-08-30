-- Guest reservation page venue contact block (settings → Reservations)
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS reservation_guest_venue jsonb DEFAULT '{
    "restaurantName": "SEOUL PRAGUE Korean BBQ",
    "address": "Václavské nám. 819/43, 110 00 Praha",
    "phone": "+420 123 456 789",
    "email": "info@seoulprague.cz"
  }'::jsonb;
