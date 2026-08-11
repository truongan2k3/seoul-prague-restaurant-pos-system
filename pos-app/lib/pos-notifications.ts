import { supabase } from "@/src/lib/supabase";

export const POS_NOTIFICATIONS_CHANNEL = "pos_notifications";

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
