import { resolveGrill } from "@/lib/reservation-capacity-engine";
import { isDiningTime } from "@/lib/reservation-dining";
import { NextResponse } from "next/server";
import { filterPastTimeSlots } from "@/lib/reservation-slots";
import { evaluateGuestSlotAvailability, fetchReservationByManageToken } from "@/src/lib/reservation-guest-server";

/**
 * Guest-facing slot availability. Returns Available / Limited / Full only —
 * never table labels or seating configurations.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date")?.trim() ?? "";
  const partySize = Math.max(1, Number(url.searchParams.get("partySize") || 2) || 2);
  const rawDuration = url.searchParams.get("diningDurationMinutes");
  const diningDurationMinutes = rawDuration === null ? undefined : Number(rawDuration);
  if (diningDurationMinutes !== undefined && !isDiningTime(diningDurationMinutes)) return NextResponse.json({ error: "Invalid dining time." }, { status: 400 });
  const grillRaw = url.searchParams.get("grill");
  let grill =
    grillRaw === "yes" || grillRaw === "no" || grillRaw === "undecided" ? grillRaw : undefined;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }

  try {
    const manageToken = url.searchParams.get("manageToken");
    let excludeReservationId: string | undefined;
    if (manageToken) {
      const booking = await fetchReservationByManageToken(manageToken);
      if (!booking.data) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
      excludeReservationId = booking.data.id;
      grill = resolveGrill({ partySize, reservedAt: booking.data.reservedAt, status: booking.data.status, notes: booking.data.notes }) ?? undefined;
    }
    const { slots, settings } = await evaluateGuestSlotAvailability({
      excludeReservationId,
      date,
      partySize,
      grill: grill ?? null,
      diningDurationMinutes,
    });

    const futureTimes = new Set(filterPastTimeSlots(slots.map((row) => row.time), date));
    const visible = slots
      .filter((row) => futureTimes.has(row.time))
      .map((row) => ({
        time: row.time,
        // Guests never see internal seating — only availability state.
        status: row.availability,
      }));

    return NextResponse.json({
      date,
      partySize,
      grill,
      maxGuestsPerSlot: settings.reservationMaxGuestsPerSlot,
      slots: visible,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Availability check failed." },
      { status: 500 },
    );
  }
}
