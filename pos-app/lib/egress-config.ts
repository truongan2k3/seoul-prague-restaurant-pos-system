/** Tunables for keeping Supabase uncached egress under control. */
export const POS_EGRESS = {
  /** Coalesce realtime bursts into one refetch. */
  REALTIME_DEBOUNCE_MS: 800,
  /** Summary tab sales window. */
  SUMMARY_SALES_DAYS: 31,
  /** History tab sales window. */
  HISTORY_SALES_DAYS: 90,
} as const;
