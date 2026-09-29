import { NextResponse } from "next/server";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { guestMessageForCancelReason } from "@/lib/reservation-cancel-reasons";
import type { ReservationEmailKind } from "@/src/lib/reservation-email";
import {
  buildManageUrl,
  sendReservationEmail,
} from "@/src/lib/reservation-email";
import {
  fetchReservationEmailContext,
  patchReservationEmailStatus,
} from "@/src/lib/reservation-guest-server";

const ALLOWED: ReservationEmailKind[] = ["received", "cancelled", "updated", "no_show"];

/** Staff-triggered guest emails (POS update, cancel, no-show). Guest submit never emails. */
export async function POST(request: Request) {
  const staff = await readStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    id?: string;
    type?: ReservationEmailKind;
    /** Optional override — normally loaded from reservation.cancellation_reason. */
    cancellationReason?: string;
  };
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

  if (type === "no_show" && data.status !== "no_show") {
    return NextResponse.json(
      { error: "Reservation is not marked no-show." },
      { status: 400 },
    );
  }

  if (type === "updated" && (data.status === "cancelled" || data.status === "no_show")) {
    return NextResponse.json(
      { error: "Cancelled reservations cannot be updated." },
      { status: 400 },
    );
  }

  if (!data.guestEmail) {
    if (type === "cancelled") {
      await patchReservationEmailStatus(id, {
        cancelEmailStatus: "skipped_no_email",
        cancelEmailError: null,
      });
    }
    return NextResponse.json({ ok: true, emailSent: false });
  }

  const cancellationGuestMessage =
    type === "cancelled"
      ? guestMessageForCancelReason(
          body.cancellationReason ?? data.cancellationReason ?? undefined,
        )
      : undefined;

  const emailResult = await sendReservationEmail(type, {
    guestName: data.guestName,
    guestEmail: data.guestEmail,
    partySize: data.partySize,
    reservedAt: new Date(data.reservedAt),
    bookingCode: data.bookingCode,
    manageUrl: buildManageUrl(data.manageToken),
    notes: data.notes ?? undefined,
    status: data.status,
    cancellationGuestMessage,
  });

  if (type === "cancelled") {
    await patchReservationEmailStatus(id, {
      cancelEmailStatus: emailResult.sent ? "sent" : "failed",
      cancelEmailError: emailResult.sent ? null : emailResult.error ?? "send_failed",
    });
  }

  return NextResponse.json({
    ok: true,
    emailSent: emailResult.sent,
    emailError: emailResult.error ?? null,
  });
}
