import { reportPrintFailed } from "@/lib/print-failed-alert";

/**
 * After Send with kitchenPrintViaStation, Print Station must confirm
 * (print_ok or print_failed). If the /print-station tab is closed, nothing
 * prints and nothing fails — this watchdog surfaces that on main POS.
 *
 * Timeout covers insert batch (~1.2s) + print/bridge (~8s) + slack.
 * Call clearPrintStationAck from PrintFailedListener when ok/failed arrives.
 */
export const PRINT_STATION_ACK_TIMEOUT_MS = 40_000;

type PendingAck = {
  id: string;
  tableId: string;
  tableLabel?: string;
  timer: ReturnType<typeof setTimeout>;
};

const pending = new Map<string, PendingAck>();

/** Cancel watchdog(s) for a table when Print Station confirms ok or failed. */
export function clearPrintStationAck(tableId?: string, tableLabel?: string) {
  if (!tableId && !tableLabel) return;
  const normId = tableId?.trim();
  const normLabel = tableLabel?.trim();
  for (const [id, entry] of [...pending.entries()]) {
    const matchId = Boolean(normId && (entry.tableId === normId || entry.tableLabel === normId));
    const matchLabel = Boolean(normLabel && (entry.tableLabel === normLabel || entry.tableId === normLabel));
    if (matchId || matchLabel) {
      clearTimeout(entry.timer);
      pending.delete(id);
    }
  }
}

/** Call after a successful Send that expects Print Station to print. */
export function expectPrintStationAck(input: {
  tableId: string;
  tableLabel?: string;
  /** Pre-translated detail shown if station never confirms. */
  offlineDetail: string;
}) {
  if (typeof window === "undefined") return;
  const tableId = input.tableId.trim();
  if (!tableId) return;

  // Clear any previous ack for this table before starting a new one
  clearPrintStationAck(tableId, input.tableLabel);

  const id = `station-ack-${tableId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const timer = setTimeout(() => {
    pending.delete(id);
    if (typeof window !== "undefined") {
      try {
        const last = localStorage.getItem("pos_last_print_ok");
        if (last) {
          const parsed = JSON.parse(last);
          const isMatch =
            Boolean(parsed.tableId && (parsed.tableId === tableId || parsed.tableId === input.tableLabel)) ||
            Boolean(parsed.tableLabel && (parsed.tableLabel === input.tableLabel || parsed.tableLabel === tableId));
          if (isMatch && Date.now() - Number(parsed.at || 0) < 60_000) {
            return;
          }
        }
      } catch {}
    }
    reportPrintFailed({
      id: `station-offline-${id}`,
      tableLabel: input.tableLabel,
      detail: input.offlineDetail,
      source: "station-offline",
    });
  }, PRINT_STATION_ACK_TIMEOUT_MS);

  pending.set(id, {
    id,
    tableId,
    tableLabel: input.tableLabel?.trim() || undefined,
    timer,
  });
}
