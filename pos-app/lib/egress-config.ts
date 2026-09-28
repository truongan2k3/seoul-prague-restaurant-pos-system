/** Tunables for keeping Supabase uncached egress under control. */
export const POS_EGRESS = {
  /** Coalesce realtime bursts into one refetch. */
  REALTIME_DEBOUNCE_MS: 800,
  /** Summary tab sales window (fetchSales paginates within this range). */
  SUMMARY_SALES_DAYS: 31,
  /**
   * @deprecated History loads the full sales table (paginated). Kept for
   * any callers that still want a bounded window.
   */
  HISTORY_SALES_DAYS: 90,
} as const;
