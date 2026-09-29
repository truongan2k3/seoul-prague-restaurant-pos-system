import { NextResponse } from "next/server";
import { createOnlineReservationServer } from "@/src/lib/reservation-guest-server";
import { releaseReservationHold } from "@/src/lib/reservation-holds";
import { reservationPushCopy, sendReservationPush } from "@/src/lib/push-server";

/**
 * Guest booking. Push notifies staff; guest email is sent ONLY when staff confirms
 * (see /api/reservations/confirm) — never on submit.
 */
export async function POST(request: Request) {
  let body: {
    guestName?: string;
    email?: string;
    phone?: string;
    guestCount?: number;
    date?: string;
    time?: string;
    notes?: string;
    eventType?: string;
    gdprConsent?: boolean;
    lang?: string;
    emailOptional?: boolean;
    receptionDesk?: boolean;
    holdToken?: string;
    wantsGrill?: "yes" | "no" | "undecided" | null;
    staffOverrideCapacity?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { data, error } = await createOnlineReservationServer({
    guestName: body.guestName ?? "",
    email: body.email ?? "",
    phone: body.phone ?? "",
    guestCount: Number(body.guestCount) || 1,
    date: body.date ?? "",
    time: body.time ?? "",
    notes: body.notes,
    eventType: body.eventType,
    gdprConsent: body.gdprConsent === true,
    emailOptional: body.emailOptional === true,
    receptionDesk: body.receptionDesk === true,
    holdToken: body.holdToken,
    wantsGrill: body.wantsGrill ?? null,
    staffOverrideCapacity: body.staffOverrideCapacity === true,
    lang:
      body.lang === "cs" ||
      body.lang === "vi" ||
      body.lang === "de" ||
      body.lang === "ko"
        ? body.lang
        : "en",
  });

  if (error || !data) {
    return NextResponse.json({ error: error ?? "Booking failed." }, { status: 400 });
  }

  await releaseReservationHold(body.holdToken);

  // Reception desk creates confirmed bookings — send confirm email there.
  // Normal online submit stays pending; email waits for staff confirm.
  let emailSent = false;
  if (body.receptionDesk && data.guestEmail && data.status === "confirmed") {
    const { buildManageUrl, sendReservationEmail } = await import("@/src/lib/reservation-email");
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

  void sendReservationPush(
    reservationPushCopy({
      kind: "new",
      guestName: data.guestName,
      partySize: data.partySize,
      reservedAt: data.reservedAt,
      bookingCode: data.bookingCode,
    }),
  );

  return NextResponse.json({
    reservation: {
      id: data.id,
      bookingCode: data.bookingCode,
      manageToken: data.manageToken,
      manageUrl: (await import("@/src/lib/reservation-email")).buildManageUrl(data.manageToken),
      guestName: data.guestName,
      partySize: data.partySize,
      reservedAt: data.reservedAt,
      status: data.status,
      emailSent,
    },
  });
}
