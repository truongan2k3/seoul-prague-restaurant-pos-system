import { NextResponse } from "next/server";
import { filterPastTimeSlots } from "@/lib/reservation-slots";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { evaluateStaffDayCapacity } from "@/src/lib/reservation-guest-server";

/** Staff capacity overview for a day — table-level detail, not exposed to guests. */
export async function GET(request: Request) {
  const staff = await readStaffSession();
  const business = staff ? null : await readAuthSession();
  if (!staff && !business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date")?.trim() ?? "";
  const partySize = Math.max(1, Number(url.searchParams.get("partySize") || 4) || 4);
  const grillRaw = url.searchParams.get("grill");
  const grill =
    grillRaw === "yes" || grillRaw === "no" || grillRaw === "undecided"
      ? grillRaw
      : grillRaw === "null"
        ? null
        : undefined;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }

  try {
    const overview = await evaluateStaffDayCapacity({
      date,
      partySize,
      grill: grill === undefined ? null : grill,
    });

    const futureTimes = new Set(filterPastTimeSlots(overview.slots.map((row) => row.time), date));
    const slots = overview.slots.filter((row) => futureTimes.has(row.time));
    const summary = {
      total: slots.length,
      available: slots.filter((row) => row.availability === "available").length,
      limited: slots.filter((row) => row.availability === "limited").length,
      full: slots.filter((row) => row.availability === "full").length,
    };

    return NextResponse.json({
      ...overview,
      slots,
      summary,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Capacity overview failed." },
      { status: 500 },
    );
  }
}
