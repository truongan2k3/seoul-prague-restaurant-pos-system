import { supabase } from "@/src/lib/supabase";

export const POS_NOTIFICATIONS_CHANNEL = "pos_notifications";
export const KITCHEN_PRINT_CHANNEL = "kitchen_print_jobs";

export type CallWaiterPayload = {
  tableId?: string;
  tableLabel?: string;
  station?: "kitchen" | "bar";
  message: string;
  at: string;
};

async function sendPosNotificationBroadcast(event: string, payload: unknown): Promise<string> {
  const getChannelsFn = (supabase as unknown as { getChannels?: () => Array<{ topic?: string; subTopic?: string }> }).getChannels;
  const existingChannels = typeof getChannelsFn === "function" ? getChannelsFn.call(supabase) : [];
  const hadExistingChannel = existingChannels.some((c) => c.topic === `realtime:${POS_NOTIFICATIONS_CHANNEL}` || c.subTopic === POS_NOTIFICATIONS_CHANNEL);

  const channel = supabase.channel(POS_NOTIFICATIONS_CHANNEL, {
    config: { broadcast: { self: true } },
  });

  const channelAny = channel as unknown as {
    state?: string;
    channelAdapter?: { isJoined?: () => boolean };
  };
  const isAlreadyJoined = channelAny.state === "joined" ||
    Boolean(channelAny.channelAdapter?.isJoined?.());

  if (!isAlreadyJoined) {
    await new Promise<void>((resolve, reject) => {
      let resolved = false;
      const timeout = window.setTimeout(() => {
        if (resolved) return;
        if (channelAny.state === "joined") {
          resolved = true;
          resolve();
        } else {
          reject(new Error("Realtime subscribe timeout"));
        }
      }, 10000);

      channel.subscribe((status) => {
        if (resolved) return;
        if (status === "SUBSCRIBED" || channelAny.state === "joined") {
          resolved = true;
          window.clearTimeout(timeout);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          resolved = true;
          window.clearTimeout(timeout);
          reject(new Error(`Realtime ${status}`));
        }
      });
    });
  }

  const result = await channel.send({
    type: "broadcast",
    event,
    payload,
  });

  if (!hadExistingChannel) {
    void supabase.removeChannel(channel);
  }
  return result;
}

export async function broadcastCallWaiter(input: {
  tableId?: string;
  tableLabel?: string;
  station?: "kitchen" | "bar";
  message?: string;
}) {
  const payload: CallWaiterPayload = {
    tableId: input.tableId,
    tableLabel: input.tableLabel,
    station: input.station,
    message: input.message ?? "Kitchen is calling for a waiter!",
    at: new Date().toISOString(),
  };

  return sendPosNotificationBroadcast("call_waiter", payload);
}

export function subscribeToCallWaiter(
  onEvent: (payload: CallWaiterPayload) => void,
): () => void {
  const channel = supabase
    .channel(POS_NOTIFICATIONS_CHANNEL, {
      config: { broadcast: { self: true } },
    })
    .on("broadcast", { event: "call_waiter" }, ({ payload }) => {
      onEvent(payload as CallWaiterPayload);
    })
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export type KitchenPrintMessagePayload = {
  jobId?: string;
  tableId?: string;
  tableLabel?: string;
  message: string;
  messageZh: string;
  at: string;
};

/** Phone/tablet → Windows Print Station (no local print on sender). */
export async function broadcastKitchenPrintMessage(input: {
  tableId?: string;
  tableLabel?: string;
  message: string;
  messageZh: string;
}) {
  const jobId = crypto.randomUUID();
  const getChannelsFn = (supabase as unknown as { getChannels?: () => Array<{ topic?: string; subTopic?: string }> }).getChannels;
  const existingChannels = typeof getChannelsFn === "function" ? getChannelsFn.call(supabase) : [];
  const hadExistingChannel = existingChannels.some((c) => c.topic === `realtime:${KITCHEN_PRINT_CHANNEL}` || c.subTopic === KITCHEN_PRINT_CHANNEL);

  const channel = supabase.channel(KITCHEN_PRINT_CHANNEL, {
    config: { broadcast: { self: true, ack: true } },
  });

  const payload: KitchenPrintMessagePayload = {
    jobId,
    tableId: input.tableId,
    tableLabel: input.tableLabel?.trim() || undefined,
    message: input.message,
    messageZh: input.messageZh,
    at: new Date().toISOString(),
  };

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      let sent = false;
      const channelAny = channel as unknown as {
        state?: string;
        channelAdapter?: { isJoined?: () => boolean };
      };
      const isAlreadyJoined = channelAny.state === "joined" ||
        Boolean(channelAny.channelAdapter?.isJoined?.());

      const startSending = () => {
        if (sent) return;
        sent = true;
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => reject(new Error(
          "Print Station did not confirm printing. Check the station and printer before retrying to avoid duplicate tickets.",
        )), 30000);
        void channel.send({ type: "broadcast", event: "kitchen_print_message", payload })
          .then(result => {
            if (result !== "ok") reject(new Error(`Kitchen message send failed: ${result}`));
          })
          .catch(reject);
      };

      channel.on("broadcast", { event: "kitchen_print_message_result" }, ({ payload: result }) => {
        if (result?.jobId !== jobId) return;
        if (result.error) reject(new Error(String(result.error)));
        else resolve();
      });

      if (isAlreadyJoined) {
        startSending();
        return;
      }

      timeout = setTimeout(() => {
        if (isAlreadyJoined || channelAny.state === "joined") {
          startSending();
        } else {
          reject(new Error("Realtime subscribe timeout"));
        }
      }, 10000);

      channel.subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          reject(new Error(`Realtime ${status}`));
        }
        if (status !== "SUBSCRIBED" || sent) return;
        startSending();
      });
    });
  } finally {
    if (timeout) clearTimeout(timeout);
    if (!hadExistingChannel) {
      void supabase.removeChannel(channel);
    }
  }
}

export function subscribeToKitchenPrintMessage(
  onEvent: (payload: KitchenPrintMessagePayload, acknowledge: (error?: string) => void) => void,
): () => void {
  const channel = supabase
    .channel(KITCHEN_PRINT_CHANNEL, {
      config: { broadcast: { self: true, ack: true } },
    })
    .on("broadcast", { event: "kitchen_print_message" }, ({ payload }) => {
      onEvent(payload as KitchenPrintMessagePayload, (error) => {
        if (!payload.jobId) return;
        void channel.send({
          type: "broadcast",
          event: "kitchen_print_message_result",
          payload: { jobId: payload.jobId, error },
        }).catch(() => { /* Sender will surface the confirmation timeout. */ });
      });
    })
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export type PrintFailedPayload = {
  tableId?: string;
  tableLabel?: string;
  detail: string;
  at: string;
  pendingId: string;
};

export type PrintOkPayload = {
  tableId: string;
  tableLabel?: string;
  at: string;
};

/** Print Station → main POS: kitchen print failed (e.g. bridge off). */
export async function broadcastPrintFailed(input: {
  tableId?: string;
  tableLabel?: string;
  detail: string;
  pendingId: string;
}) {
  const payload: PrintFailedPayload = {
    tableId: input.tableId?.trim() || undefined,
    tableLabel: input.tableLabel?.trim() || undefined,
    detail: input.detail,
    pendingId: input.pendingId,
    at: new Date().toISOString(),
  };

  return sendPosNotificationBroadcast("print_failed", payload);
}

/** Print Station → main POS: kitchen ticket printed (acks Send watchdog). */
export async function broadcastPrintOk(input: {
  tableId: string;
  tableLabel?: string;
}) {
  const payload: PrintOkPayload = {
    tableId: input.tableId,
    tableLabel: input.tableLabel?.trim() || undefined,
    at: new Date().toISOString(),
  };

  return sendPosNotificationBroadcast("print_ok", payload);
}

export function subscribeToPrintFailed(
  onEvent: (payload: PrintFailedPayload) => void,
): () => void {
  const channel = supabase
    .channel(POS_NOTIFICATIONS_CHANNEL, {
      config: { broadcast: { self: true } },
    })
    .on("broadcast", { event: "print_failed" }, ({ payload }) => {
      onEvent(payload as PrintFailedPayload);
    })
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeToPrintOk(
  onEvent: (payload: PrintOkPayload) => void,
): () => void {
  const channel = supabase
    .channel(POS_NOTIFICATIONS_CHANNEL, {
      config: { broadcast: { self: true } },
    })
    .on("broadcast", { event: "print_ok" }, ({ payload }) => {
      onEvent(payload as PrintOkPayload);
    })
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
