import type { TableAvailabilitySource } from "@/lib/table-availability";
import type { GrillNeed } from "@/lib/reservation-capacity-engine";
import { normalizeTableLabel } from "@/lib/reservation-floor-plan";

/** Check actual seating conflicts only; unassigned demand does not lock a table. */
export function checkInTableIssue(source: TableAvailabilitySource, tableId: string,
  reservationId: string, partySize: number, grill: GrillNeed) {
  const table = source.tables.find((row) => row.id === tableId);
  const issue = (code: string, message: string) => ({ code, message });
  if (!table) return issue("TABLE_NOT_CONFIGURED", "This table is not configured as a dining table. Select a dining table or ask staff to check its configuration.");
  if (table.blocked) return issue("TABLE_BLOCKED", `${table.label} is blocked in POS. Staff must unblock it before check-in.`);
  if (table.occupied) return issue("TABLE_OCCUPIED", `${table.label} is currently occupied. Release the table in POS before checking in another party.`);
  if (!Number.isInteger(partySize) || partySize < 1) return issue("INVALID_PARTY_SIZE", "Enter a valid number of guests.");
  if (partySize > table.capacity) return issue("TABLE_CAPACITY", `${table.label} seats ${table.capacity}, but this check-in has ${partySize} guests. Adjust the actual guest count or select a larger table.`);
  if (grill === "yes" && !table.grill) return issue("TABLE_NO_GRILL", `${table.label} has no BBQ grill, but this reservation requires BBQ. Select a BBQ table or ask staff to update the booking.`);
  const now = new Date(source.serverNow).getTime();
  const duration = source.durationMinutes * 60_000;
  const buffer = source.bufferMinutes * 60_000;
  const assigned = source.reservations.filter((row) => row.id !== reservationId
    && [row.tableLabel, row.secondaryTableLabel, row.tertiaryTableLabel]
      .some((label) => normalizeTableLabel(label) === table.label));
  if (assigned.some((row) => row.status === "checked_in")) {
    return issue("TABLE_ACTIVE_CHECK_IN", `${table.label} is empty on the floor map but still linked to another checked-in reservation. Staff must complete or move that reservation in POS.`);
  }
  const booking = assigned.filter((row) => ["pending", "confirmed", "late"].includes(row.status))
    .filter((row) => new Date(row.reservedAt).getTime() - buffer < now + duration
      && new Date(row.reservedAt).getTime() + duration > now)
    .sort((a, b) => new Date(a.reservedAt).getTime() - new Date(b.reservedAt).getTime())[0];
  if (booking) {
    const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(booking.reservedAt));
    return issue("TABLE_RESERVED", `${table.label} is empty but assigned to another reservation at ${time}, overlapping the ${source.durationMinutes}-minute dining period plus buffer. Staff can change or remove that assignment in POS.`);
  }
  return null;
}
