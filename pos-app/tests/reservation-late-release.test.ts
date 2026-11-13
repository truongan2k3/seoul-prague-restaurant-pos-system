import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateReservationCapacity, planReservationAllocations, type CapacityReservationInput } from "../lib/reservation-capacity-engine";
import { countGuestsInSlot, filterSlotsByCapacity } from "../lib/reservation-slots";
import { calculateTableAvailability, type TableAvailabilitySource } from "../lib/table-availability";
import { checkInTableIssues } from "../lib/reservation-check-in";
import { RESERVATION_FLOOR_TABLES } from "../lib/reservation-floor-plan";

const now = Date.parse("2026-11-14T17:30:00Z");
const at = "2026-11-14T17:00:00Z";
const late: CapacityReservationInput = { id: "late", status: "late", partySize: 12, reservedAt: at, tableLabel: "A1" };
function source(reservations = [late]): TableAvailabilitySource {
  return { serverNow: new Date(now).toISOString(), durationMinutes: 90, bufferMinutes: 0, reservations,
    tables: RESERVATION_FLOOR_TABLES.map(table => ({ ...table, id: table.label, occupied: false, occupiedAt: null, blocked: false })) };
}
function evaluate(reservations: CapacityReservationInput[]) {
  return evaluateReservationCapacity({ dateIso: "2026-11-14", time: "18:30", partySize: 12, grill: "yes",
    reservations, occupiedTables: RESERVATION_FLOOR_TABLES.map(table => ({ label: table.label, occupied: false,
      blocked: table.label !== "A1" })), nowMs: now });
}

test("Late keeps its status and assignment while releasing capacity for another guest", () => {
  assert.notEqual(evaluate([late]).availability, "full");
  assert.equal(evaluate([late]).overlappingGuestCount, 0);
  assert.equal(late.status, "late"); assert.equal(late.tableLabel, "A1");
  assert.equal(planReservationAllocations({ reservations: [late], durationMinutes: 90, nowMs: now }).length, 0);
});

test("unassigned Late groups and Late holds no longer consume seats", () => {
  const unassigned = { ...late, tableLabel: undefined };
  assert.notEqual(evaluate([unassigned]).availability, "full");
  assert.equal(evaluate([unassigned]).overlappingGuestCount, 0);
});

test("returning a Late booking to Confirmed holds its slot again", () => {
  assert.equal(evaluate([{ ...late, status: "confirmed" }]).availability, "full");
});

test("per-slot guest limits exclude Late but retain pending, confirmed and checked-in guests", () => {
  const rows = ["late", "pending", "confirmed", "checked_in"].map(status => ({ partySize: 3, reservedAt: at, status }));
  assert.equal(countGuestsInSlot(rows, "2026-11-14", "18:00", 30), 9);
  assert.deepEqual(filterSlotsByCapacity(["18:00"], [{ partySize: 12, reservedAt: at, status: "late" }],
    "2026-11-14", 30, 12, 12), ["18:00"]);
});

test("live availability removes Late deadlines and reservation protection", () => {
  const result = calculateTableAvailability(source());
  const table = result.tables.find(row => row.label === "A1")!;
  assert.equal(table.status, "available"); assert.equal(table.availableNow, true);
  assert.equal(table.nextReservationAt, null); assert.equal(table.availableUntil, null);
  assert.deepEqual(table.upcomingReservations, []);
});

test("Late does not free a physically occupied, checked-in, or manually blocked table", () => {
  for (const kind of ["occupied", "checked_in", "blocked"]) {
    const state = source();
    if (kind === "checked_in") state.reservations.push({ ...late, id: "seated", status: "checked_in", checkedInAt: at });
    else state.tables[0] = { ...state.tables[0], occupied: kind === "occupied", blocked: kind === "blocked", occupiedAt: at };
    const table = calculateTableAvailability(state).tables.find(row => row.label === "A1")!;
    assert.notEqual(table.status, "available"); assert.equal(table.availableNow, false);
  }
});

test("another Late assignment is not a check-in warning, but confirmed assignments still are", () => {
  assert.equal(checkInTableIssues(source(), "A1", "arriving", 2, "yes").length, 0);
  assert.equal(checkInTableIssues(source([{ ...late, status: "confirmed" }]), "A1", "arriving", 2, "yes")[0]?.code, "TABLE_RESERVED");
});

test("Late assignments on D2/D3 also release the internal nine-person fallback", () => {
  const reservations: CapacityReservationInput[] = RESERVATION_FLOOR_TABLES.map(table => ({
    id: table.label, status: ["D2", "D3"].includes(table.label) ? "late" : "confirmed",
    tableLabel: table.label, partySize: table.capacity, reservedAt: at,
  }));
  const result = evaluateReservationCapacity({ dateIso: "2026-11-14", time: "18:30", partySize: 9, grill: "yes", reservations, nowMs: now });
  assert.notEqual(result.availability, "full"); assert.equal(result.recommendationLabel, null);
});
