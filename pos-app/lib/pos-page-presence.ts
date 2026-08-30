import { supabase } from "@/src/lib/supabase";
import type { PageTarget } from "@/lib/page-routes";
import { resolveConnectionStatus, type ConnectionStatus } from "@/lib/connection-status";

export const PAGE_PRESENCE_CHANNEL = "pos_page_presence";

export type PagePresencePayload = {
  page: PageTarget;
  at: string;
  userAgent?: string;
};

export type PagePresenceState = {
  page: PageTarget;
  lastSeenAt: string;
  online: boolean;
};

const ONLINE_THRESHOLD_MS = 45_000;

export function isPageOnline(lastSeenAt: string, now = Date.now()) {
  return now - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
}

export function trackPagePresence(
  page: PageTarget,
  onStatusChange?: (status: ConnectionStatus) => void,
): () => void {
  const channel = supabase.channel(PAGE_PRESENCE_CHANNEL, {
    config: { broadcast: { self: true } },
  });

  let intervalId: number | undefined;
  let realtimeConnected = false;

  const emitStatus = () => {
    onStatusChange?.(
      resolveConnectionStatus({
        networkOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
        realtimeConnected,
      }),
    );
  };

  const sendHeartbeat = () => {
    const payload: PagePresencePayload = {
      page,
      at: new Date().toISOString(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 120) : undefined,
    };
    void channel.send({
      type: "broadcast",
      event: "heartbeat",
      payload,
    });
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
      sendHeartbeat();
      if (intervalId == null) {
        intervalId = window.setInterval(sendHeartbeat, 15_000);
      }
      emitStatus();
      return;
    }
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      realtimeConnected = false;
      emitStatus();
    }
  });

  return () => {
    if (intervalId != null) window.clearInterval(intervalId);
    if (typeof window !== "undefined") {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    }
    void supabase.removeChannel(channel);
  };
}

export function subscribeToPagePresence(
  onUpdate: (payload: PagePresencePayload) => void,
): () => void {
  const channel = supabase
    .channel(PAGE_PRESENCE_CHANNEL)
    .on("broadcast", { event: "heartbeat" }, ({ payload }) => {
      onUpdate(payload as PagePresencePayload);
    })
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function buildPresenceMap(
  updates: Map<PageTarget, PagePresencePayload>,
  now = Date.now(),
): PagePresenceState[] {
  return (["main", "client", "server", "kds", "bar", "print-station"] as PageTarget[]).map((page) => {
    const entry = updates.get(page);
    const lastSeenAt = entry?.at ?? "";
    return {
      page,
      lastSeenAt,
      online: lastSeenAt ? isPageOnline(lastSeenAt, now) : false,
    };
  });
}
