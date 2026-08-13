-- Per-screen marquee configs (pos / client / kds / bar) with multiple messages.
-- Legacy marquee_* columns remain for backward compatibility.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS marquee_configs jsonb;

COMMENT ON COLUMN settings.marquee_configs IS
  'Per-surface marquee: { pos, client, kds, bar } each with enabled, messages[], durationSeconds, fontFamily, endAt';

NOTIFY pgrst, 'reload schema';
