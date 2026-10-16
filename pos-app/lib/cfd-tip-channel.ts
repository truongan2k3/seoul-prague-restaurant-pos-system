import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/src/lib/supabase";
import type { CfdCheckoutPayload } from "@/lib/cfd-display";
import { isCfdTipRequest, type CfdTipRequest } from "@/lib/cfd-tip";

// One event-only return channel per browser. Existing snapshots/cache remain POS-owned.
const TOPIC = "cfd_tip_selection";
let channel: RealtimeChannel | null = null;
let reconnect: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<(request: CfdTipRequest) => void>();
const replies = new Map<string, (payload: CfdCheckoutPayload | null) => void>();
let users = 0;
const onReady = new Set<() => void>();

function connect() {
  if (channel || users === 0) return;
  const next = supabase.channel(TOPIC, { config: { broadcast: { ack: true, self: false } } });
  channel = next;
  next.on("broadcast", { event: "SELECT_TIP" }, ({ payload }) => {
    if (isCfdTipRequest(payload)) listeners.forEach((listener) => listener(payload));
  }).on("broadcast", { event: "TIP_ACCEPTED" }, ({ payload }) => {
    const id = payload?.customerTip?.requestId;
    if (typeof id === "string") replies.get(id)?.(payload as CfdCheckoutPayload);
  }).subscribe((status) => {
    if (channel !== next) return;
    if (status === "SUBSCRIBED") onReady.forEach((send) => send());
    if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
      channel = null;
      void supabase.removeChannel(next);
      clearTimeout(reconnect);
      if (users) reconnect = setTimeout(connect, 1500);
    }
  });
}

function acquire() {
  users += 1;
  connect();
  return () => {
    users -= 1;
    if (users !== 0) return;
    clearTimeout(reconnect);
    const old = channel;
    channel = null;
    if (old) void supabase.removeChannel(old);
  };
}

export function subscribeCfdTipRequests(listener: (request: CfdTipRequest) => void) {
  listeners.add(listener);
  const release = acquire();
  return () => { listeners.delete(listener); release(); };
}

export const retainCfdTipChannel = acquire;

export function acknowledgeCfdTip(payload: CfdCheckoutPayload) {
  if (channel?.state === "joined") {
    void channel.send({ type: "broadcast", event: "TIP_ACCEPTED", payload });
  }
}

/** A channel send ACK is not POS acceptance. Wait for the authoritative checkout reply. */
export async function requestCfdTip(request: CfdTipRequest): Promise<CfdCheckoutPayload | null> {
  const release = acquire();
  try {
    return await new Promise((resolve) => {
      const timer = setTimeout(() => finish(null), 7000);
      const finish = (payload: CfdCheckoutPayload | null) => {
        clearTimeout(timer);
        onReady.delete(send);
        replies.delete(request.requestId);
        resolve(payload);
      };
      replies.set(request.requestId, finish);
      const send = () => {
        onReady.delete(send);
        void channel?.send({ type: "broadcast", event: "SELECT_TIP", payload: request })
          .then((result) => { if (result !== "ok") finish(null); })
          .catch(() => finish(null));
      };
      if (channel?.state === "joined") send();
      else onReady.add(send);
    });
  } finally { release(); }
}
