import { NextResponse } from "next/server";
import { readStaffSession } from "@/src/lib/auth/staff-session";
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
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const kind = body.kind;
  if (kind !== "new" && kind !== "updated" && kind !== "cancelled" && kind !== "no_show") {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  const guestName = body.guestName?.trim();
  const partySize = Number(body.partySize) || 0;
  const reservedAt = body.reservedAt;
  if (!guestName || !reservedAt || partySize < 1) {
    return NextResponse.json({ error: "Missing reservation fields" }, { status: 400 });
  }

  const payload = reservationPushCopy({
    kind,
    guestName,
    partySize,
    reservedAt,
    bookingCode: body.bookingCode,
  });
  if (body.reservationId) {
    payload.tag = `reservation-${kind}-${body.reservationId}`;
  }

  const result = await sendReservationPush(payload);
  return NextResponse.json({ ok: true, ...result });
}
