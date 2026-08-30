import { NextResponse } from "next/server";
import {
  buildManageUrl,
  sendReservationEmail,
} from "@/src/lib/reservation-email";
import { createOnlineReservationServer } from "@/src/lib/reservation-guest-server";

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

  let emailSent = false;
  if (data.guestEmail) {
    const emailResult = await sendReservationEmail("received", {
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
    reservation: {
      bookingCode: data.bookingCode,
      manageToken: data.manageToken,
      manageUrl: buildManageUrl(data.manageToken),
      guestName: data.guestName,
      partySize: data.partySize,
      reservedAt: data.reservedAt,
      status: data.status,
      emailSent,
    },
  });
}
