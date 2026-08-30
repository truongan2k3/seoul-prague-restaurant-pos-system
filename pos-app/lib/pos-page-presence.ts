import { supabase } from "@/src/lib/supabase";
import type { PageTarget } from "@/lib/page-routes";

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

export function trackPagePresence(page: PageTarget): () => void {
  const channel = supabase.channel(PAGE_PRESENCE_CHANNEL, {
    config: { broadcast: { self: true } },
  });

  let intervalId: number | undefined;

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

  void new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Presence subscribe timeout")), 5000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        window.clearTimeout(timeout);
        sendHeartbeat();
        intervalId = window.setInterval(sendHeartbeat, 15_000);
        resolve();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        window.clearTimeout(timeout);
        reject(new Error(`Presence ${status}`));
      }
    });
  }).catch(() => {
    // Non-fatal — status dashboard may show offline until reconnect.
  });

  return () => {
    if (intervalId != null) window.clearInterval(intervalId);
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
