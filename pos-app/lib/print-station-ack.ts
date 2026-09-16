import { reportPrintFailed } from "@/lib/print-failed-alert";

/**
 * After Send with kitchenPrintViaStation, Print Station must confirm
 * (print_ok or print_failed). If the /print-station tab is closed, nothing
 * prints and nothing fails — this watchdog surfaces that on main POS.
 *
 * Timeout covers insert batch (~1.2s) + print/bridge (~8s) + slack.
 * Call clearPrintStationAck from PrintFailedListener when ok/failed arrives.
 */
export const PRINT_STATION_ACK_TIMEOUT_MS = 15_000;

type PendingAck = {
  id: string;
  tableId: string;
  tableLabel?: string;
  timer: ReturnType<typeof setTimeout>;
};

const pending = new Map<string, PendingAck>();

/** Cancel watchdog(s) for a table when Print Station confirms ok or failed. */
export function clearPrintStationAck(tableId?: string) {
  if (!tableId) return;
  for (const [id, entry] of [...pending.entries()]) {
    if (entry.tableId !== tableId) continue;
    clearTimeout(entry.timer);
    pending.delete(id);
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

  const id = `station-ack-${tableId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const timer = setTimeout(() => {
    pending.delete(id);
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
