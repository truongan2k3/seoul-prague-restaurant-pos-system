import { getVapidPublicKey } from "@/lib/push-vapid-public";

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
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (error) {
    console.warn("[web-push] SW register failed", error);
    return null;
  }
}

/** Register SW + save push subscription so alerts work when the POS tab is closed. */
export async function ensurePushSubscription(): Promise<"subscribed" | "denied" | "unsupported" | "error"> {
  if (!canUseWebPush()) return "unsupported";

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : Notification.permission === "denied"
        ? "denied"
        : await Notification.requestPermission();

  if (permission === "denied") return "denied";
  if (permission !== "granted") return "denied";

  const registration = await registerPosServiceWorker();
  if (!registration) return "error";

  await navigator.serviceWorker.ready;

  const publicKey = getVapidPublicKey();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
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
}): void {
  if (typeof window === "undefined") return;
  void fetch("/api/push/reservation-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
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
    }),
  }).catch(() => {
    /* ignore network errors */
  });
}
