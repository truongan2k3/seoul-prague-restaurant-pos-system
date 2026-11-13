import { getVapidPublicKey } from "@/lib/push-vapid-public";
import type { ReservationNotificationSnapshot } from "@/lib/reservation-notification-details";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function canUseWebPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerPosServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!canUseWebPush()) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  } catch (error) {
    console.warn("[web-push] SW register failed", error);
    return null;
  }
}

export type PushSubscriptionStatus = "subscribed" | "denied" | "unsupported" | "error" | "prompt";
let subscriptionPending: Promise<PushSubscriptionStatus> | null = null;

/** Register SW + save push subscription so alerts work when the POS tab is closed.
 * Background bootstrap never consumes the user-gesture permission prompt. */
export async function ensurePushSubscription(options: { requestPermission?: boolean } = {}): Promise<PushSubscriptionStatus> {
  if (!canUseWebPush()) return "unsupported";
  if (Notification.permission === "default" && options.requestPermission === false) return "prompt";

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : Notification.permission === "denied"
        ? "denied"
        : await Notification.requestPermission();

  if (permission === "denied") return "denied";
  if (permission !== "granted") return "denied";

  if (subscriptionPending) return subscriptionPending;
  subscriptionPending = savePushSubscription().catch(() => "error" as const).finally(() => {
    subscriptionPending = null;
  });
  return subscriptionPending;
}

async function savePushSubscription(): Promise<PushSubscriptionStatus> {
  if (!await registerPosServiceWorker()) return "error";
  // A newly installed worker may not be active yet. Always use ready's active
  // registration rather than subscribing against an installing worker.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 10000); }),
  ]).finally(() => clearTimeout(timer));
  if (!registration) return "error";
  const publicKey = urlBase64ToUint8Array(getVapidPublicKey());
  let subscription = await registration.pushManager.getSubscription();
  const oldKey = subscription?.options.applicationServerKey;
  if (subscription && oldKey && (oldKey.byteLength !== publicKey.byteLength || !publicKey.every((value, i) => new Uint8Array(oldKey)[i] === value))) {
    if (!await subscription.unsubscribe()) return "error";
    subscription = null;
  }
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey as BufferSource,
      });
    } catch (error) {
      console.warn("[web-push] subscribe failed", error);
      return "error";
    }
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return "error";

  try {
    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      }),
    });
    if (!response.ok) return "error";
    return "subscribed";
  } catch {
    return "error";
  }
}

export type ClientPushKind = "new" | "updated" | "cancelled" | "no_show";

/** Fire-and-forget Web Push fan-out after a staff-side reservation mutation. */
export function notifyReservationPushEvent(input: {
  kind: ClientPushKind;
  reservationId: string;
  guestName: string;
  partySize: number;
  reservedAt: Date | string;
  bookingCode?: string | null;
  updatedAt?: Date | string;
  previous?: ReservationNotificationSnapshot;
  cancellationReason?: string;
  cancellationNote?: string;
  cancelledBy?: string;
}): void {
  if (typeof window === "undefined") return;
  const send = () => fetch("/api/push/reservation-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    keepalive: true,
    body: JSON.stringify({
      kind: input.kind,
      reservationId: input.reservationId,
      guestName: input.guestName,
      partySize: input.partySize,
      reservedAt:
        typeof input.reservedAt === "string"
          ? input.reservedAt
          : input.reservedAt.toISOString(),
      bookingCode: input.bookingCode ?? null,
      updatedAt: input.updatedAt,
      previous: input.previous,
      cancellationReason: input.cancellationReason,
      cancellationNote: input.cancellationNote,
      cancelledBy: input.cancelledBy,
    }),
  });
  void (async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await send();
        if (response.ok || response.status < 500) return;
      } catch { /* Brief network loss: retry once without redoing the mutation. */ }
      if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 400));
    }
    console.warn("[web-push] reservation notification request failed");
  })();
}
