import { NextResponse } from "next/server";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";
import type { ReservationNotificationSnapshot } from "@/lib/reservation-notification-details";
import {
  reservationPushCopy,
  sendReservationPush,
  type ReservationPushKind,
} from "@/src/lib/push-server";

/** Staff POS → fan-out Web Push after local Supabase writes (covers phones with app closed). */
export async function POST(request: Request) {
  const staff = await readStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    kind?: ReservationPushKind;
    guestName?: string;
    partySize?: number;
    reservedAt?: string;
    bookingCode?: string | null;
    reservationId?: string;
    updatedAt?: string;
    previous?: ReservationNotificationSnapshot;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const kind = body.kind;
  if (kind !== "new" && kind !== "updated" && kind !== "cancelled" && kind !== "no_show") {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  if (typeof body.reservationId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.reservationId)) return NextResponse.json({ error: "Invalid reservation" }, { status: 400 });
  const { data: row, error } = await createSupabaseAdmin().from("reservations")
    .select("id,guest_name,party_size,reserved_at,booking_code,status,cancellation_reason,cancellation_note,cancelled_by,notes,guest_phone,guest_email,event_type,updated_at")
    .eq("id", body.reservationId).maybeSingle();
  if (error || !row) return NextResponse.json({ error: "Reservation unavailable" }, { status: 404 });
  if ((kind === "cancelled" && row.status !== "cancelled") || (kind === "no_show" && row.status !== "no_show")) return NextResponse.json({ error: "Reservation status changed" }, { status: 409 });
  if (kind === "updated" && body.updatedAt && new Date(body.updatedAt).getTime() !== new Date(row.updated_at).getTime()) return NextResponse.json({ ok: true, skipped: "superseded" });
  let previous: ReservationNotificationSnapshot | undefined;
  if (body.previous && typeof body.previous === "object" && !Array.isArray(body.previous)) {
    previous = {};
    if (typeof body.previous.partySize === "number" && Number.isInteger(body.previous.partySize) && body.previous.partySize > 0 && body.previous.partySize <= 10000) previous.partySize = body.previous.partySize;
    if (typeof body.previous.reservedAt === "string" && body.previous.reservedAt.length <= 64 && Number.isFinite(Date.parse(body.previous.reservedAt))) previous.reservedAt = body.previous.reservedAt;
    if (typeof body.previous.guestName === "string" && body.previous.guestName.length <= 300) previous.guestName = body.previous.guestName;
    for (const key of ["guestPhone", "guestEmail", "notes", "eventType"] as const) {
      const value = body.previous[key];
      if (value === null || (typeof value === "string" && value.length <= (key === "notes" ? 10000 : 300))) previous[key] = value;
    }
  }

  const payload = reservationPushCopy({
    kind,
    guestName: row.guest_name,
    partySize: row.party_size,
    reservedAt: row.reserved_at,
    bookingCode: row.booking_code,
    cancellationReason: row.cancellation_reason,
    cancellationNote: row.cancellation_note,
    cancelledBy: row.cancelled_by,
    notes: row.notes,
    guestPhone: row.guest_phone,
    guestEmail: row.guest_email,
    eventType: row.event_type,
    previous,
  });
  if (body.reservationId) {
    payload.tag = `reservation-${kind}-${body.reservationId}`;
  }

  const result = await sendReservationPush(payload);
  return NextResponse.json({ ok: !result.error, ...result }, { status: result.error ? 503 : 200 });
}
