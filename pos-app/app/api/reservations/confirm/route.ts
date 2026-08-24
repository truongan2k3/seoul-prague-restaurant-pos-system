import { NextResponse } from "next/server";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import {
  buildManageUrl,
  sendReservationEmail,
} from "@/src/lib/reservation-email";
import { confirmReservationServer } from "@/src/lib/reservation-guest-server";

export async function POST(request: Request) {
  const staff = await readStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const id = body.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing reservation id." }, { status: 400 });
  }

  const { data, error } = await confirmReservationServer(id);
  if (error || !data) {
    return NextResponse.json({ error: error ?? "Confirm failed." }, { status: 400 });
  }

  let emailSent = false;
  if (data.guestEmail) {
    const emailResult = await sendReservationEmail("confirmed", {
      guestName: data.guestName,
      guestEmail: data.guestEmail,
      partySize: data.partySize,
      reservedAt: new Date(data.reservedAt),
      bookingCode: data.bookingCode,
      manageUrl: buildManageUrl(data.manageToken),
      notes: data.notes ?? undefined,
      status: data.status,
    });
    emailSent = emailResult.sent;
  }

  return NextResponse.json({
    ok: true,
    emailSent,
    bookingCode: data.bookingCode,
  });
}
