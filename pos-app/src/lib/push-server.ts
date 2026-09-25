import webpush from "web-push";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";
import { getVapidPublicKey } from "@/lib/push-vapid-public";
import { formatVoucherAmount } from "@/lib/voucher";

export type ReservationPushKind = "new" | "updated" | "cancelled" | "no_show";

export type PosPushKind =
  | ReservationPushKind
  | "voucher_order"
  | "voucher_guest_paid"
  | "guest_chat"
  | "guest_chat_follow_up";

export type PosPushPayload = {
  kind: PosPushKind;
  title: string;
  body: string;
  tag?: string;
  url?: string;
};

export type ReservationPushPayload = PosPushPayload & { kind: ReservationPushKind };

type StoredSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function configureVapid(): boolean {
  const publicKey = getVapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:pos@seoulprague.com";

  if (!publicKey || !privateKey) {
    console.warn(
      "[web-push] Missing VAPID_PRIVATE_KEY (and/or public key). Background push disabled.",
    );
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export async function upsertPushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
  staffId?: string | null;
}): Promise<{ error: string | null }> {
  try {
    const admin = createSupabaseAdmin();
    const { error } = await admin.from("push_subscriptions").upsert(
      {
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        user_agent: input.userAgent ?? null,
        staff_id: input.staffId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
    return { error: error?.message ?? null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to save subscription" };
  }
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  try {
    const admin = createSupabaseAdmin();
    await admin.from("push_subscriptions").delete().eq("endpoint", endpoint);
  } catch {
    /* ignore */
  }
}

async function listSubscriptions(): Promise<StoredSubscription[]> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .limit(500);
  if (error || !data) {
    console.error("[web-push] list subscriptions failed", error?.message);
    return [];
  }
  return data as StoredSubscription[];
}

/** Fan-out a POS alert to all saved device subscriptions (phone / closed tab). */
export async function sendPosPush(payload: PosPushPayload): Promise<{
  sent: number;
  failed: number;
}> {
  if (!configureVapid()) return { sent: 0, failed: 0 };

  const subs = await listSubscriptions();
  if (subs.length === 0) return { sent: 0, failed: 0 };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    tag: payload.tag ?? `pos-${payload.kind}`,
    url: payload.url ?? "/app",
    kind: payload.kind,
  });

  let sent = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
          { TTL: 60 * 60 },
        );
        sent += 1;
      } catch (error) {
        failed += 1;
        const statusCode =
          typeof error === "object" && error && "statusCode" in error
            ? Number((error as { statusCode?: number }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          await deletePushSubscription(sub.endpoint);
        } else {
          console.error("[web-push] send failed", sub.endpoint.slice(0, 48), error);
        }
      }
    }),
  );

  return { sent, failed };
}

/** Reservation fan-out — same transport as sendPosPush. */
export async function sendReservationPush(payload: ReservationPushPayload) {
  return sendPosPush(payload);
}

export function reservationPushCopy(input: {
  kind: ReservationPushKind;
  guestName: string;
  partySize: number;
  reservedAt: string | Date;
  bookingCode?: string | null;
}): ReservationPushPayload {
  const when = new Date(input.reservedAt).toLocaleString("en-GB", {
    timeZone: "Europe/Prague",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const code = input.bookingCode ? ` · ${input.bookingCode}` : "";
  const body = `${input.guestName} · ${input.partySize} pax · ${when}${code}`;

  const title =
    input.kind === "cancelled"
      ? "Reservation cancelled"
      : input.kind === "no_show"
        ? "Reservation no-show"
        : input.kind === "updated"
          ? "Reservation updated"
          : "New reservation";

  return {
    kind: input.kind,
    title,
    body,
    tag: `reservation-${input.kind}-${input.guestName}`.slice(0, 64),
    url: "/app",
  };
}

export function voucherOrderPushCopy(input: {
  orderId: string;
  buyerName: string;
  buyerEmail?: string;
  totalCzk: number;
}): PosPushPayload {
  const who = input.buyerName.trim() || input.buyerEmail?.trim() || "Guest";
  return {
    kind: "voucher_order",
    title: "New voucher order",
    body: `${input.orderId} · ${formatVoucherAmount(input.totalCzk)} · ${who}`,
    tag: `voucher-order-${input.orderId}`.slice(0, 64),
    url: "/app",
  };
}

export function voucherGuestPaidPushCopy(input: {
  orderId: string;
  buyerName: string;
  buyerEmail?: string;
  totalCzk: number;
}): PosPushPayload {
  const who = input.buyerName.trim() || input.buyerEmail?.trim() || "Guest";
  return {
    kind: "voucher_guest_paid",
    title: "Guest marked voucher as paid",
    body: `${input.orderId} · ${formatVoucherAmount(input.totalCzk)} · ${who}`,
    tag: `voucher-paid-${input.orderId}`.slice(0, 64),
    url: "/app",
  };
}

export function guestChatPushCopy(input: {
  kind?: "new_message" | "follow_up";
  sessionId: string;
  preview?: string | null;
}): PosPushPayload {
  const followUp = input.kind === "follow_up";
  return {
    kind: followUp ? "guest_chat_follow_up" : "guest_chat",
    title: followUp ? "Chat follow-up request" : "New guest chat",
    body: (input.preview ?? "").trim() || "A guest sent a message on the website.",
    tag: `guest-chat-${input.sessionId}`.slice(0, 64),
    url: "/app",
  };
}
