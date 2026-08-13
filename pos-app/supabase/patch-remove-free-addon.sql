-- Remove legacy "free spicy soup" checkbox config from all menu items.
UPDATE public.menu_items
SET customization_config = customization_config - 'freeAddOn'
WHERE customization_config ? 'freeAddOn';

UPDATE public.menu_items
SET customization_config = NULL
WHERE customization_config = '{}'::jsonb;
