import { NextResponse } from "next/server";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import type { ReservationEmailKind } from "@/src/lib/reservation-email";
import {
  buildManageUrl,
  sendReservationEmail,
} from "@/src/lib/reservation-email";
import { fetchReservationEmailContext } from "@/src/lib/reservation-guest-server";

const ALLOWED: ReservationEmailKind[] = ["cancelled"];

/** Staff-triggered guest emails after a client-side status change (e.g. cancel). */
export async function POST(request: Request) {
  const staff = await readStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { id?: string; type?: ReservationEmailKind };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const id = body.id?.trim();
  const type = body.type;
  if (!id || !type || !ALLOWED.includes(type)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { data, error } = await fetchReservationEmailContext(id);
  if (error || !data) {
    return NextResponse.json({ error: error ?? "Not found" }, { status: 404 });
  }

  if (type === "cancelled" && data.status !== "cancelled") {
    return NextResponse.json(
      { error: "Reservation is not cancelled." },
      { status: 400 },
    );
  }

  if (!data.guestEmail) {
    return NextResponse.json({ ok: true, emailSent: false });
  }

  const emailResult = await sendReservationEmail(type, {
    guestName: data.guestName,
    guestEmail: data.guestEmail,
    partySize: data.partySize,
    reservedAt: new Date(data.reservedAt),
    bookingCode: data.bookingCode,
    manageUrl: buildManageUrl(data.manageToken),
    notes: data.notes ?? undefined,
    status: data.status,
  });

  return NextResponse.json({ ok: true, emailSent: emailResult.sent });
}
