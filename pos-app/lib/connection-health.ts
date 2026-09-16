import { supabase } from "@/src/lib/supabase";
import { resolveConnectionStatus, type ConnectionStatus } from "@/lib/connection-status";

/**
 * Monitor network + Realtime connectivity without broadcasting heartbeats.
 * (Page online map / printer presence heartbeats were removed to cut Realtime usage.)
 */
export function trackConnectionHealth(
  onStatusChange?: (status: ConnectionStatus) => void,
): () => void {
  const channel = supabase.channel("pos_conn_health", {
    config: { broadcast: { self: false } },
  });

  let realtimeConnected = false;

  const emitStatus = () => {
    onStatusChange?.(
      resolveConnectionStatus({
        networkOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
        realtimeConnected,
      }),
    );
  };

  const handleOnline = () => emitStatus();
  const handleOffline = () => {
    realtimeConnected = false;
    emitStatus();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
  }

  emitStatus();

  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      realtimeConnected = true;
      emitStatus();
      return;
    }
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      realtimeConnected = false;
      emitStatus();
    }
  });

  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    }
    void supabase.removeChannel(channel);
  };
}
