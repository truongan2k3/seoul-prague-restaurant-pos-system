import { supabase } from "@/src/lib/supabase";

export const PRINT_BRIDGE_PRESENCE_CHANNEL = "pos_print_bridge_presence";

export type PrintBridgePresencePayload = {
  online: boolean;
  at: string;
  source?: string;
  detail?: string;
  /** Host-only diagnostics (optional). */
  bridgeOnline?: boolean;
  printStationOnline?: boolean;
};

export type PrintBridgePresenceSnapshot = {
  online: boolean;
  detail?: string;
  bridgeOnline?: boolean;
  printStationOnline?: boolean;
};

const ONLINE_THRESHOLD_MS = 45_000;
const HEARTBEAT_INTERVAL_MS = 12_000;

export function isPrintBridgePresenceFresh(
  at: string,
  now = Date.now(),
): boolean {
  const ts = new Date(at).getTime();
  if (Number.isNaN(ts)) return false;
  return now - ts < ONLINE_THRESHOLD_MS;
}

/**
 * Broadcast this PC's combined Printer ready state so tablets inherit Printer Online/Offline.
 */
export function startPrintBridgePresencePublisher(
  getSnapshot: () => PrintBridgePresenceSnapshot,
): () => void {
  const channel = supabase.channel(PRINT_BRIDGE_PRESENCE_CHANNEL, {
    config: { broadcast: { self: true } },
  });

  let intervalId: number | undefined;

  const send = () => {
    const snap = getSnapshot();
    const payload: PrintBridgePresencePayload = {
      online: snap.online,
      at: new Date().toISOString(),
      source:
        typeof navigator !== "undefined"
          ? navigator.userAgent.slice(0, 80)
          : undefined,
      detail: snap.detail,
      bridgeOnline: snap.bridgeOnline,
      printStationOnline: snap.printStationOnline,
    };
    void channel.send({
      type: "broadcast",
      event: "heartbeat",
      payload,
    });
  };

  channel.subscribe((status) => {
    if (status !== "SUBSCRIBED") return;
    send();
    if (intervalId == null) {
      intervalId = window.setInterval(send, HEARTBEAT_INTERVAL_MS);
    }
  });

  return () => {
    if (intervalId != null) window.clearInterval(intervalId);
    void supabase.removeChannel(channel);
  };
}

export function subscribePrintBridgePresence(
  onUpdate: (payload: PrintBridgePresencePayload) => void,
): () => void {
  const channel = supabase
    .channel(PRINT_BRIDGE_PRESENCE_CHANNEL)
    .on("broadcast", { event: "heartbeat" }, ({ payload }) => {
      onUpdate(payload as PrintBridgePresencePayload);
    })
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
