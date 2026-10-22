import { occupiedTableRelease, planReservationAllocations, type CapacityReservationInput } from "@/lib/reservation-capacity-engine";
import { reservationDiningMinutes } from "@/lib/reservation-dining";
import { RESERVATION_FLOOR_TABLES } from "@/lib/reservation-floor-plan";

export type LiveTableStatus = "available" | "occupied" | "reserved" | "blocked";
export type AvailabilityTable = {
  id: string; label: string; capacity: number; grill: boolean;
  occupied: boolean; occupiedAt: string | null; blocked: boolean;
};
export type TableAvailabilitySource = {
  serverNow: string; durationMinutes: number; bufferMinutes: number;
  tables: AvailabilityTable[]; reservations: CapacityReservationInput[];
};
export type LiveTableAvailability = AvailabilityTable & {
  status: LiveTableStatus; estimatedReleaseAt: number | null;
  earliestSeatingAt: number | null; nextReservationAt: number | null;
  upcomingReservations: { reservedAt: number; partySize: number }[];
  overEstimatedTime: boolean;
};

/** Same allocation engine on the server and for local, network-free countdowns. */
export function calculateTableAvailability(source: TableAvailabilitySource, now = new Date(source.serverNow).getTime()) {
  const duration = source.durationMinutes * 60_000;
  const occupiedTables = availabilityOccupancyInputs(source);
  const allocations = planReservationAllocations({ reservations: source.reservations, occupiedTables,
    durationMinutes: source.durationMinutes, bufferMinutes: source.bufferMinutes, nowMs: now });
  const tables: LiveTableAvailability[] = source.tables.map((table) => {
    const occupied = table.occupied || source.reservations.some((r) => r.status === "checked_in"
      && [r.tableLabel, r.secondaryTableLabel, r.tertiaryTableLabel].some((label) => label?.trim().toUpperCase() === table.label));
    const release = occupied ? occupiedTableRelease({ ...table, occupiedAt: table.occupiedAt }, source.reservations, source.durationMinutes) : null;
    const spans = allocations.filter((a) => a.labels.includes(table.label)).sort((a, b) => a.startMs - b.startMs);
    const protectedNow = spans.some((a) => a.startMs < now + duration && a.endMs > now);
    const status: LiveTableStatus = occupied ? "occupied" : table.blocked ? "blocked" : protectedNow ? "reserved" : "available";
    let earliest: number | null = table.blocked ? null : occupied ? release && release > now ? release : null : now;
    if (earliest !== null) {
      for (const span of spans) {
        if (span.startMs < earliest + duration && span.endMs > earliest) earliest = span.endMs;
      }
      if (!Number.isFinite(earliest) || earliest > new Date(source.serverNow).getTime() + 48 * 60 * 60_000) earliest = null;
    }
    const upcomingReservations = source.reservations.filter((r) => ["pending", "confirmed", "late"].includes(r.status)
      && [r.tableLabel, r.secondaryTableLabel, r.tertiaryTableLabel].some((label) => label?.trim().toUpperCase() === table.label))
      .map((r) => ({ reservedAt: new Date(r.reservedAt).getTime(), partySize: r.actualPartySize ?? r.partySize, durationMinutes: reservationDiningMinutes(r, source.durationMinutes) }))
      .filter((r) => r.reservedAt + r.durationMinutes * 60_000 > now).sort((a, b) => a.reservedAt - b.reservedAt);
    const nextReservation = upcomingReservations[0]?.reservedAt ?? null;
    return { ...table, occupied, status, estimatedReleaseAt: release, earliestSeatingAt: earliest,
      nextReservationAt: nextReservation, upcomingReservations, overEstimatedTime: occupied && release !== null && release <= now };
  });
  const available = tables.filter((t) => t.status === "available");
  const future = tables.filter((t) => t.status !== "available").map((t) => t.earliestSeatingAt)
    .filter((at): at is number => at !== null && at > now);
  return { tables, available: available.length, large: available.filter((t) => t.capacity > 4).length,
    small: available.filter((t) => t.capacity <= 4).length,
    occupied: tables.filter((t) => t.status === "occupied").length,
    reserved: tables.filter((t) => t.status === "reserved").length,
    blocked: tables.filter((t) => t.status === "blocked").length,
    nextAvailableAt: future.length ? Math.min(...future) : null };
}

/** Read-only suggestions; estimated future releases never turn occupied tables into ready tables. */
export function suggestWalkInTables(tables: LiveTableAvailability[], partySize: number, grill: boolean, now: number) {
  const compatible = tables.filter((table) => table.capacity >= partySize && (!grill || table.grill) && !table.blocked);
  const ready = compatible.filter((table) => table.status === "available")
    .sort((a, b) => a.capacity - b.capacity || a.label.localeCompare(b.label, undefined, { numeric: true }));
  const upcoming = compatible.filter((table) => table.status !== "available" && table.earliestSeatingAt !== null && table.earliestSeatingAt > now)
    .sort((a, b) => a.earliestSeatingAt! - b.earliestSeatingAt! || a.capacity - b.capacity);
  return { ready, upcoming };
}

export function availabilityOccupancyInputs(source: TableAvailabilitySource) {
  return RESERVATION_FLOOR_TABLES.map((def) => {
    const table = source.tables.find((row) => row.label === def.label);
    return { label: def.label, occupied: table?.occupied ?? false, occupiedAt: table?.occupiedAt ?? null,
      blocked: !table || table.blocked };
  });
}
