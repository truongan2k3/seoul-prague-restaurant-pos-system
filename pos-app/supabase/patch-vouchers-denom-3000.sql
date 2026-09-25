-- Add 3000 CZK denomination to existing voucher configs (sorted ascending).
UPDATE public.settings
SET voucher_config = jsonb_set(
  voucher_config,
  '{denominationsCzk}',
  COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(v) ORDER BY v)
      FROM (
        SELECT DISTINCT (jsonb_array_elements_text(
          COALESCE(voucher_config->'denominationsCzk', '[]'::jsonb)
        ))::int AS v
        UNION ALL
        SELECT 3000
      ) dens
    ),
    '[1000, 2000, 3000, 5000]'::jsonb
  )
)
WHERE NOT (
  COALESCE(voucher_config->'denominationsCzk', '[]'::jsonb) @> '[3000]'::jsonb
);

NOTIFY pgrst, 'reload schema';
