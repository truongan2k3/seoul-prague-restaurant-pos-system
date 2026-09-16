/** In-app pub/sub so POS can show a print-failure alert (station broadcast or local direct print). */

export type PrintFailedAlertPayload = {
  id: string;
  tableLabel?: string;
  detail: string;
  /**
   * station → reprint on Print Station; station-offline → open /print-station;
   * direct → check bridge/printer on this device.
   */
  source: "station" | "station-offline" | "direct";
};

type Listener = (payload: PrintFailedAlertPayload) => void;

const listeners = new Set<Listener>();

export function reportPrintFailed(input: {
  tableLabel?: string;
  detail: string;
  source: "station" | "station-offline" | "direct";
  id?: string;
}) {
  const payload: PrintFailedAlertPayload = {
    id: input.id ?? `print-fail-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    tableLabel: input.tableLabel?.trim() || undefined,
    detail: input.detail.trim() || "Print failed",
    source: input.source,
  };
  listeners.forEach((listener) => {
    try {
      listener(payload);
    } catch {
      /* ignore listener errors */
    }
  });
}

export function subscribeToPrintFailedAlerts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
