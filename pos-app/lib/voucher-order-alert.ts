import type { VoucherOrder } from "@/lib/voucher";
import { supabase } from "@/src/lib/supabase";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";

export const VOUCHER_ORDER_ALERT_CHANNEL = "pos-voucher-order-alerts";
export const VOUCHER_ORDER_ALERT_EVENT = "voucher-order";

export type VoucherOrderAlertPayload = {
  orderId: string;
  orderUuid: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  denominationCzk: number;
  quantity: number;
  totalCzk: number;
  paymentMethod: string;
  createdAt: string;
};

export function subscribeToVoucherOrderAlerts(
  onEvent: (payload: VoucherOrderAlertPayload) => void,
): () => void {
  const channel = supabase
    .channel(VOUCHER_ORDER_ALERT_CHANNEL)
    .on("broadcast", { event: VOUCHER_ORDER_ALERT_EVENT }, ({ payload }) => {
      const data = payload as VoucherOrderAlertPayload | undefined;
      if (!data?.orderId || !data.orderUuid) return;
      onEvent(data);
    })
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

function realtimeBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
}

function realtimeKey(): string | null {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    null
  );
}

export async function broadcastVoucherOrderAlert(order: VoucherOrder): Promise<void> {
  const payload: VoucherOrderAlertPayload = {
    orderId: order.orderId,
    orderUuid: order.id,
    buyerName: order.buyerName,
    buyerEmail: order.buyerEmail,
    buyerPhone: order.buyerPhone ?? "",
    denominationCzk: order.denominationCzk,
    quantity: order.quantity,
    totalCzk: order.totalCzk,
    paymentMethod: order.paymentMethod,
    createdAt: order.createdAt,
  };

  const sentHttp = await sendViaRealtimeHttp(payload);
  if (sentHttp) return;
  await sendViaChannel(payload);
}

async function sendViaRealtimeHttp(payload: VoucherOrderAlertPayload): Promise<boolean> {
  const base = realtimeBaseUrl();
  const key = realtimeKey();
  if (!base || !key) return false;
  try {
    const response = await fetch(`${base}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            topic: VOUCHER_ORDER_ALERT_CHANNEL,
            event: VOUCHER_ORDER_ALERT_EVENT,
            payload,
            private: false,
          },
        ],
      }),
    });
    if (!response.ok) {
      console.error(
        "[voucher-order-alert] HTTP broadcast failed",
        response.status,
        await response.text().catch(() => ""),
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error("[voucher-order-alert] HTTP broadcast error", error);
    return false;
  }
}

async function sendViaChannel(payload: VoucherOrderAlertPayload): Promise<void> {
  try {
    const admin = createSupabaseAdmin();
    const channel = admin.channel(VOUCHER_ORDER_ALERT_CHANNEL, {
      config: { broadcast: { ack: true } },
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("subscribe timeout")), 4000);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeout);
          resolve();
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timeout);
          reject(new Error(status));
        }
      });
    });
    await channel.send({
      type: "broadcast",
      event: VOUCHER_ORDER_ALERT_EVENT,
      payload,
    });
    void admin.removeChannel(channel);
  } catch (error) {
    console.error("[voucher-order-alert] channel broadcast failed", error);
  }
}
