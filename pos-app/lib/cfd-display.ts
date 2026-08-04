import type { RealtimeChannel } from "@supabase/supabase-js";
import type { MenuItem, OrderItem } from "@/lib/types";
import { supabase } from "@/src/lib/supabase";

export const CFD_CHANNEL = "cfd_display";

export type CfdClientState = "idle" | "checkout" | "thankyou";

export type CfdEventName =
  | "START_CHECKOUT"
  | "PAYMENT_SUCCESS"
  | "CANCEL_CHECKOUT"
  | "TERMINAL_PENDING";

export interface CfdCheckoutItem {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface CfdCheckoutPayload {
  tableNumber: string;
  items: CfdCheckoutItem[];
  subtotal: number;
  discount: number;
  tip: number;
  total: number;
  amountDueNow: number;
}

export interface CfdEventPayload {
  START_CHECKOUT: CfdCheckoutPayload;
  PAYMENT_SUCCESS: { tableNumber?: string };
  CANCEL_CHECKOUT: Record<string, never>;
  TERMINAL_PENDING: { amount: number };
}

const GOOGLE_REVIEW_URL =
  "https://www.google.com/maps/search/?api=1&query=Seoul+Prague+Restaurant";

export const DEFAULT_CFD_REVIEW_URL = GOOGLE_REVIEW_URL;

export function getCfdReviewQrUrl(reviewUrl?: string, size = 220): string {
  const target = (reviewUrl?.trim() || DEFAULT_CFD_REVIEW_URL);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(target)}`;
}

export function buildCfdCheckoutPayload(
  tableNumber: string,
  orders: OrderItem[],
  menuItems: MenuItem[],
  totals: {
    subtotal: number;
    discount: number;
    tip: number;
    grandTotal: number;
    amountDueNow: number;
  },
): CfdCheckoutPayload {
  const menuById = new Map(menuItems.map((item) => [item.id, item]));

  const items: CfdCheckoutItem[] = orders.map((order) => {
    const menu = order.menuItemId ? menuById.get(order.menuItemId) : undefined;
    const name = menu?.nameEn?.trim() || order.name;
    return {
      name,
      quantity: order.quantity,
      unitPrice: order.price,
      lineTotal: order.price * order.quantity,
    };
  });

  return {
    tableNumber,
    items,
    subtotal: totals.subtotal,
    discount: totals.discount,
    tip: totals.tip,
    total: totals.grandTotal,
    amountDueNow: totals.amountDueNow,
  };
}

let broadcasterChannel: RealtimeChannel | null = null;
let broadcasterReady: Promise<RealtimeChannel> | null = null;

function ensureBroadcasterChannel(): Promise<RealtimeChannel> {
  if (broadcasterReady) return broadcasterReady;

  broadcasterReady = new Promise((resolve, reject) => {
    broadcasterChannel = supabase.channel(CFD_CHANNEL, {
      config: { broadcast: { self: false } },
    });

    broadcasterChannel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        resolve(broadcasterChannel!);
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        broadcasterReady = null;
        broadcasterChannel = null;
        reject(err ?? new Error(`CFD channel ${status}`));
      }
    });
  });

  return broadcasterReady;
}

export async function sendCfdEvent<E extends CfdEventName>(
  event: E,
  payload: CfdEventPayload[E],
): Promise<void> {
  try {
    const channel = await ensureBroadcasterChannel();
    await channel.send({
      type: "broadcast",
      event,
      payload,
    });
  } catch (error) {
    console.warn("[CFD] Broadcast failed:", error);
  }
}

export function subscribeCfdEvents(handlers: {
  onStartCheckout: (payload: CfdCheckoutPayload) => void;
  onPaymentSuccess: () => void;
  onCancelCheckout: () => void;
}): () => void {
  const channel = supabase.channel(CFD_CHANNEL, {
    config: { broadcast: { self: false } },
  });

  channel
    .on("broadcast", { event: "START_CHECKOUT" }, ({ payload }) => {
      if (payload && typeof payload === "object") {
        handlers.onStartCheckout(payload as CfdCheckoutPayload);
      }
    })
    .on("broadcast", { event: "PAYMENT_SUCCESS" }, () => {
      handlers.onPaymentSuccess();
    })
    .on("broadcast", { event: "CANCEL_CHECKOUT" }, () => {
      handlers.onCancelCheckout();
    })
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
