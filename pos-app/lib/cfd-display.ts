import type { RealtimeChannel } from "@supabase/supabase-js";
import type { MenuItem, OrderItem } from "@/lib/types";
import { supabase } from "@/src/lib/supabase";

export const CFD_CHANNEL = "cfd_display";

export type CfdClientState = "idle" | "checkout" | "thankyou";

export type CfdEventName =
  | "START_CHECKOUT"
  | "PAYMENT_SUCCESS"
  | "CANCEL_CHECKOUT";

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
  /** Cash tendered by guest (staff entered). */
  amountGiven?: number;
  /** Change to return when amountGiven exceeds the charge. */
  changeDue?: number;
  /** Staff opened/updated checkout on POS — interrupt idle; thank-you may still queue. */
  staffInitiated?: boolean;
  /**
   * When true and CFD is on thank-you, queue this checkout until thank-you
   * has shown at least the minimum duration (split next-person flow).
   */
  deferIfThankYou?: boolean;
}

export interface CfdEventPayload {
  START_CHECKOUT: CfdCheckoutPayload;
  PAYMENT_SUCCESS: { tableNumber?: string };
  CANCEL_CHECKOUT: Record<string, never>;
}

export interface CfdPersistedSnapshot {
  state: CfdClientState;
  checkout: CfdCheckoutPayload | null;
  thankYouTable: string | null;
  updatedAt: string;
}

const GOOGLE_REVIEW_URL =
  "https://www.google.com/maps/search/?api=1&query=Seoul+Prague+Restaurant";

export const DEFAULT_CFD_REVIEW_URL = GOOGLE_REVIEW_URL;

const SUBSCRIBE_TIMEOUT_MS = 5_000;
const RECONNECT_DELAY_MS = 1_500;
const SEND_RETRIES = 2;

let channelSeq = 0;
function uniqueCfdChannelName(): string {
  channelSeq += 1;
  return `${CFD_CHANNEL}-tx-${channelSeq}`;
}

export function isCfdGifMedia(url: string) {
  return /\.gif(\?|#|$)/i.test(url.trim());
}

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
    amountGiven?: number;
    changeDue?: number;
    staffInitiated?: boolean;
    deferIfThankYou?: boolean;
  },
): CfdCheckoutPayload {
  const menuById = new Map(menuItems.map((item) => [item.id, item]));

  const merged = new Map<string, CfdCheckoutItem>();

  for (const order of orders) {
    const menu = order.menuItemId ? menuById.get(order.menuItemId) : undefined;
    const name = menu?.nameEn?.trim() || order.name;
    const unitPrice = order.price;
    const key = `${name}::${unitPrice.toFixed(2)}`;
    const lineTotal = order.price * order.quantity;
    const existing = merged.get(key);

    if (existing) {
      existing.quantity += order.quantity;
      existing.lineTotal += lineTotal;
    } else {
      merged.set(key, {
        name,
        quantity: order.quantity,
        unitPrice,
        lineTotal,
      });
    }
  }

  return {
    tableNumber,
    items: [...merged.values()],
    subtotal: totals.subtotal,
    discount: totals.discount,
    tip: totals.tip,
    total: totals.grandTotal,
    amountDueNow: totals.amountDueNow,
    amountGiven: totals.amountGiven,
    changeDue: totals.changeDue,
    staffInitiated: totals.staffInitiated,
    deferIfThankYou: totals.deferIfThankYou,
  };
}

let broadcasterChannel: RealtimeChannel | null = null;
let broadcasterReady: Promise<RealtimeChannel> | null = null;

function resetBroadcaster() {
  const current = broadcasterChannel;
  broadcasterChannel = null;
  broadcasterReady = null;
  if (current) {
    void supabase.removeChannel(current);
  }
}

function ensureBroadcasterChannel(): Promise<RealtimeChannel> {
  if (broadcasterReady) return broadcasterReady;

  broadcasterReady = new Promise((resolve, reject) => {
    const channel = supabase.channel(uniqueCfdChannelName(), {
      config: { broadcast: { self: false } },
    });
    broadcasterChannel = channel;

    const timeout = setTimeout(() => {
      resetBroadcaster();
      reject(new Error("CFD broadcaster subscribe timeout"));
    }, SUBSCRIBE_TIMEOUT_MS);

    channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve(channel);
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        clearTimeout(timeout);
        resetBroadcaster();
        reject(err ?? new Error(`CFD channel ${status}`));
      }
    });
  });

  return broadcasterReady;
}

async function persistCfdSnapshot(snapshot: {
  state: CfdClientState;
  checkout: CfdCheckoutPayload | null;
  thankYouTable?: string | null;
}): Promise<void> {
  try {
    const { error } = await supabase.from("cfd_display_state").upsert({
      id: 1,
      client_state: snapshot.state,
      checkout_payload: snapshot.checkout,
      thank_you_table: snapshot.thankYouTable ?? snapshot.checkout?.tableNumber ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.warn("[CFD] Persist state failed:", error.message);
    }
  } catch (error) {
    console.warn("[CFD] Persist state failed:", error);
  }
}

export async function fetchCfdDisplaySnapshot(): Promise<CfdPersistedSnapshot | null> {
  try {
    const { data, error } = await supabase
      .from("cfd_display_state")
      .select("client_state, checkout_payload, thank_you_table, updated_at")
      .eq("id", 1)
      .maybeSingle();

    if (error || !data) return null;

    const state = data.client_state as CfdClientState;
    if (state !== "idle" && state !== "checkout" && state !== "thankyou") {
      return null;
    }

    return {
      state,
      checkout:
        data.checkout_payload && typeof data.checkout_payload === "object"
          ? (data.checkout_payload as CfdCheckoutPayload)
          : null,
      thankYouTable: data.thank_you_table ?? null,
      updatedAt: data.updated_at ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** CFD local thank-you timer ended — clear store only if still on thank-you. */
export async function releaseCfdThankYouState(): Promise<void> {
  try {
    const snapshot = await fetchCfdDisplaySnapshot();
    if (!snapshot || snapshot.state !== "thankyou") return;
    await persistCfdSnapshot({
      state: "idle",
      checkout: null,
      thankYouTable: null,
    });
  } catch {
    // ignore
  }
}

async function broadcastOnce<E extends CfdEventName>(
  event: E,
  payload: CfdEventPayload[E],
): Promise<boolean> {
  const channel = await ensureBroadcasterChannel();
  const result = await channel.send({
    type: "broadcast",
    event,
    payload,
  });

  if (result === "ok") return true;

  // Channel likely stale — force recreate and let caller retry.
  resetBroadcaster();
  throw new Error(`CFD broadcast result: ${String(result)}`);
}

let checkoutPersistTimer: ReturnType<typeof setTimeout> | null = null;
let lastCheckoutPersistKey: string | null = null;

function scheduleCheckoutPersist(payload: CfdCheckoutPayload) {
  const key = JSON.stringify(payload);
  if (key === lastCheckoutPersistKey) return;
  if (checkoutPersistTimer) clearTimeout(checkoutPersistTimer);
  checkoutPersistTimer = setTimeout(() => {
    checkoutPersistTimer = null;
    lastCheckoutPersistKey = key;
    void persistCfdSnapshot({
      state: "checkout",
      checkout: payload,
    });
  }, 450);
}

export async function sendCfdEvent<E extends CfdEventName>(
  event: E,
  payload: CfdEventPayload[E],
): Promise<void> {
  if (event === "START_CHECKOUT") {
    scheduleCheckoutPersist(payload as CfdCheckoutPayload);
  } else {
    if (checkoutPersistTimer) {
      clearTimeout(checkoutPersistTimer);
      checkoutPersistTimer = null;
    }
    if (event === "PAYMENT_SUCCESS") {
      const tableNumber = (payload as CfdEventPayload["PAYMENT_SUCCESS"]).tableNumber;
      await persistCfdSnapshot({
        state: "thankyou",
        checkout: null,
        thankYouTable: tableNumber ?? null,
      });
    } else if (event === "CANCEL_CHECKOUT") {
      await persistCfdSnapshot({
        state: "idle",
        checkout: null,
        thankYouTable: null,
      });
    }
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= SEND_RETRIES; attempt += 1) {
    try {
      const ok = await broadcastOnce(event, payload);
      if (ok) return;
    } catch (error) {
      lastError = error;
      resetBroadcaster();
    }
  }

  console.warn("[CFD] Broadcast failed after retries:", lastError);
}

export function subscribeCfdEvents(handlers: {
  onStartCheckout: (payload: CfdCheckoutPayload) => void;
  onPaymentSuccess: (payload?: CfdEventPayload["PAYMENT_SUCCESS"]) => void;
  onCancelCheckout: () => void;
  onResubscribed?: () => void;
}): () => void {
  let disposed = false;
  let channel: RealtimeChannel | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const teardown = () => {
    if (!channel) return;
    const current = channel;
    channel = null;
    void supabase.removeChannel(current);
  };

  const connect = () => {
    if (disposed) return;
    teardown();

    channel = supabase.channel(`${CFD_CHANNEL}-rx-${++channelSeq}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "START_CHECKOUT" }, ({ payload }) => {
        if (payload && typeof payload === "object") {
          handlers.onStartCheckout(payload as CfdCheckoutPayload);
        }
      })
      .on("broadcast", { event: "PAYMENT_SUCCESS" }, ({ payload }) => {
        handlers.onPaymentSuccess(
          payload && typeof payload === "object"
            ? (payload as CfdEventPayload["PAYMENT_SUCCESS"])
            : undefined,
        );
      })
      .on("broadcast", { event: "CANCEL_CHECKOUT" }, () => {
        handlers.onCancelCheckout();
      })
      .subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          handlers.onResubscribed?.();
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          teardown();
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      });
  };

  connect();

  return () => {
    disposed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    teardown();
  };
}

/** Apply DB snapshot onto the same handlers used by live broadcast. */
export function applyCfdSnapshot(
  snapshot: CfdPersistedSnapshot,
  handlers: {
    onStartCheckout: (payload: CfdCheckoutPayload) => void;
    onPaymentSuccess: (payload?: CfdEventPayload["PAYMENT_SUCCESS"]) => void;
    onCancelCheckout: () => void;
  },
  options?: { thankYouMaxAgeMs?: number },
): void {
  if (snapshot.state === "checkout" && snapshot.checkout) {
    handlers.onStartCheckout({ ...snapshot.checkout, staffInitiated: true });
    return;
  }
  if (snapshot.state === "thankyou") {
    const maxAge = options?.thankYouMaxAgeMs ?? 25_000;
    const ageMs = Date.now() - new Date(snapshot.updatedAt).getTime();
    if (Number.isFinite(ageMs) && ageMs > maxAge) {
      handlers.onCancelCheckout();
      return;
    }
    handlers.onPaymentSuccess({
      tableNumber: snapshot.thankYouTable ?? snapshot.checkout?.tableNumber,
    });
    return;
  }
  handlers.onCancelCheckout();
}

export function checkoutPayloadFingerprint(payload: CfdCheckoutPayload | null): string {
  if (!payload) return "";
  return [
    payload.tableNumber,
    payload.amountDueNow,
    payload.tip,
    payload.discount,
    payload.total,
    payload.amountGiven ?? "",
    payload.changeDue ?? "",
    payload.items.map((item) => `${item.name}:${item.quantity}:${item.lineTotal}`).join("|"),
  ].join("::");
}
