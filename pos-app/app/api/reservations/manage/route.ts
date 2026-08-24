import { NextResponse } from "next/server";
import {
  cancelReservationByManageToken,
  fetchReservationByManageToken,
  updateReservationByManageToken,
} from "@/src/lib/reservation-guest-server";
import {
  buildManageUrl,
  sendReservationEmail,
} from "@/src/lib/reservation-email";

function publicReservation(data: NonNullable<
  Awaited<ReturnType<typeof fetchReservationByManageToken>>["data"]
>) {
  return {
    bookingCode: data.bookingCode,
    guestName: data.guestName,
    guestEmail: data.guestEmail,
    guestPhone: data.guestPhone,
    partySize: data.partySize,
    reservedAt: data.reservedAt,
    status: data.status,
    notes: data.notes,
    manageUrl: buildManageUrl(data.manageToken),
  };
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const { data, error } = await fetchReservationByManageToken(token);
  if (error || !data) {
    return NextResponse.json({ error: error ?? "Not found" }, { status: 404 });
  }
  return NextResponse.json({ reservation: publicReservation(data) });
}

export async function PATCH(request: Request) {
  let body: {
    token?: string;
    date?: string;
    time?: string;
    guestCount?: number;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { data, error } = await updateReservationByManageToken({
    token: body.token ?? "",
    date: body.date ?? "",
    time: body.time ?? "",
    guestCount: Number(body.guestCount) || 1,
    notes: body.notes,
  });

  if (error || !data) {
    return NextResponse.json({ error: error ?? "Update failed." }, { status: 400 });
  }

  let emailSent = false;
  if (data.guestEmail) {
    const emailResult = await sendReservationEmail("updated", {
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
    reservation: publicReservation(data),
    emailSent,
  });
}

export async function DELETE(request: Request) {
  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { data, error } = await cancelReservationByManageToken(body.token ?? "");
  if (error || !data) {
    return NextResponse.json({ error: error ?? "Cancel failed." }, { status: 400 });
  }

  let emailSent = false;
  if (data.guestEmail) {
    const emailResult = await sendReservationEmail("cancelled", {
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
    reservation: publicReservation(data),
    emailSent,
  });
}
