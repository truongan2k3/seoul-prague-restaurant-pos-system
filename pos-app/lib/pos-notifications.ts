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

export async function broadcastCallWaiter(input: {
  tableId?: string;
  tableLabel?: string;
  station?: "kitchen" | "bar";
  message?: string;
}) {
  const channel = supabase.channel(POS_NOTIFICATIONS_CHANNEL, {
    config: { broadcast: { self: true } },
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Realtime subscribe timeout")), 4000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        window.clearTimeout(timeout);
        resolve();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        window.clearTimeout(timeout);
        reject(new Error(`Realtime ${status}`));
      }
    });
  });

  const payload: CallWaiterPayload = {
    tableId: input.tableId,
    tableLabel: input.tableLabel,
    station: input.station,
    message: input.message ?? "Kitchen is calling for a waiter!",
    at: new Date().toISOString(),
  };

  const result = await channel.send({
    type: "broadcast",
    event: "call_waiter",
    payload,
  });

  void supabase.removeChannel(channel);
  return result;
}

export function subscribeToCallWaiter(
  onEvent: (payload: CallWaiterPayload) => void,
): () => void {
  const channel = supabase
    .channel(POS_NOTIFICATIONS_CHANNEL)
    .on("broadcast", { event: "call_waiter" }, ({ payload }) => {
      onEvent(payload as CallWaiterPayload);
    })
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export type KitchenPrintMessagePayload = {
  tableId?: string;
  tableLabel: string;
  message: string;
  messageZh: string;
  at: string;
};

/** Phone/tablet → Windows Print Station (no local print on sender). */
export async function broadcastKitchenPrintMessage(input: {
  tableId?: string;
  tableLabel: string;
  message: string;
  messageZh: string;
}) {
  const channel = supabase.channel(KITCHEN_PRINT_CHANNEL, {
    config: { broadcast: { self: true } },
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Realtime subscribe timeout")), 4000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        window.clearTimeout(timeout);
        resolve();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        window.clearTimeout(timeout);
        reject(new Error(`Realtime ${status}`));
      }
    });
  });

  const payload: KitchenPrintMessagePayload = {
    tableId: input.tableId,
    tableLabel: input.tableLabel,
    message: input.message,
    messageZh: input.messageZh,
    at: new Date().toISOString(),
  };

  const result = await channel.send({
    type: "broadcast",
    event: "kitchen_print_message",
    payload,
  });

  void supabase.removeChannel(channel);
  return result;
}

export function subscribeToKitchenPrintMessage(
  onEvent: (payload: KitchenPrintMessagePayload) => void,
): () => void {
  const channel = supabase
    .channel(KITCHEN_PRINT_CHANNEL)
    .on("broadcast", { event: "kitchen_print_message" }, ({ payload }) => {
      onEvent(payload as KitchenPrintMessagePayload);
    })
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
