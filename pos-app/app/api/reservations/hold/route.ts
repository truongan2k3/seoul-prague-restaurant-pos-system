import { NextResponse } from "next/server";
import {
  createReservationHold,
  releaseReservationHold,
} from "@/src/lib/reservation-holds";

/** Create a short-lived capacity hold while the guest completes booking. */
export async function POST(request: Request) {
  let body: {
    date?: string;
    time?: string;
    partySize?: number;
    wantsGrill?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const date = body.date?.trim() ?? "";
  const time = body.time?.trim() ?? "";
  const partySize = Math.max(1, Number(body.partySize) || 1);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: "Invalid date or time." }, { status: 400 });
  }

  const result = await createReservationHold({
    dateIso: date,
    time,
    partySize,
    wantsGrill: body.wantsGrill ?? null,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    holdToken: result.token,
    expiresAt: result.expiresAt,
  });
}

/** Release a hold early (guest abandons or navigates away). */
export async function DELETE(request: Request) {
  let body: { holdToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  await releaseReservationHold(body.holdToken);
  return NextResponse.json({ ok: true });
}
