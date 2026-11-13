import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateReservationCapacity, evaluateSlotsForGuest, planReservationAllocations,
  type CapacityEvaluateInput, type CapacityReservationInput } from "../lib/reservation-capacity-engine";
import { RESERVATION_FLOOR_TABLES, buildAllSeatingConfigurations } from "../lib/reservation-floor-plan";
import { calculateTableAvailability } from "../lib/table-availability";

const at = "2026-11-14T18:00:00Z"; // 19:00 Prague
const now = Date.parse("2026-11-14T17:00:00Z");
const occupiedTables = RESERVATION_FLOOR_TABLES.map(table => ({ label: table.label, occupied: false }));
const booked: CapacityReservationInput[] = RESERVATION_FLOOR_TABLES
  .filter(table => !["D2", "D3"].includes(table.label))
  .map(table => ({ id: `assigned:${table.label}`, tableLabel: table.label,
    partySize: table.capacity, reservedAt: at, status: "confirmed" }));
function input(changes: Partial<CapacityEvaluateInput> = {}): CapacityEvaluateInput {
  return { dateIso: "2026-11-14", time: "19:00", partySize: 9, grill: "yes",
    reservations: booked, occupiedTables, nowMs: now, ...changes };
}

test("free D2 and D3 keep booking open for 5–9 guests when all other tables are assigned", () => {
  for (const partySize of [5, 6, 7, 8, 9]) {
    for (const grill of ["yes", "no", null] as const) {
      const result = evaluateReservationCapacity(input({ partySize, grill }));
      assert.notEqual(result.availability, "full");
      assert.equal(result.grillCompatible, true);
    }
  }
  assert.equal(evaluateReservationCapacity(input({ partySize: 10 })).availability, "full");
});

test("the exception never changes physical capacities or exposes a combined seating suggestion", () => {
  const result = evaluateReservationCapacity(input());
  assert.equal(result.recommendation, null);
  assert.equal(result.recommendationLabel, null);
  assert.equal(result.capacity, null);
  assert.doesNotMatch(JSON.stringify(result), /D2|D3/);
  assert.equal(RESERVATION_FLOOR_TABLES.find(table => table.label === "D2")?.capacity, 4);
  assert.equal(RESERVATION_FLOOR_TABLES.find(table => table.label === "D3")?.capacity, 4);
  assert.ok(buildAllSeatingConfigurations().every(config => config.labels.length === 1));
});

test("either occupied or manually locked table disables the exception", () => {
  for (const label of ["D2", "D3"]) {
    for (const blocked of [false, true]) {
      const floor = occupiedTables.map(table => table.label === label
        ? { ...table, occupied: !blocked, blocked, occupiedAt: "2026-11-14T15:00:00Z" }
        : table);
      assert.equal(evaluateReservationCapacity(input({ occupiedTables: floor })).availability, "full");
    }
  }
});

test("overlapping assignments on either table, including secondary/tertiary, block the pair", () => {
  for (const label of ["D2", "D3"]) {
    for (const field of ["tableLabel", "secondaryTableLabel", "tertiaryTableLabel"]) {
      const reservation = { id: "other", partySize: 2, status: "confirmed", reservedAt: at, [field]: label };
      assert.equal(evaluateReservationCapacity(input({ reservations: [...booked, reservation] })).availability, "full");
    }
  }
});

test("non-overlapping assignments do not close an earlier fitting dining window", () => {
  const later = { id: "later", partySize: 4, tableLabel: "D2", status: "confirmed", reservedAt: "2026-11-14T20:00:00Z" };
  assert.notEqual(evaluateReservationCapacity(input({ reservations: [...booked, later] })).availability, "full");
  const overlapping = { ...later, reservedAt: "2026-11-14T19:00:00Z" };
  assert.equal(evaluateReservationCapacity(input({ reservations: [...booked, overlapping] })).availability, "full");
});

test("an existing unassigned booking/hold for nine consumes both tables and prevents another booking", () => {
  for (const id of ["booking-9", "hold:guest-9"]) {
    const reservations = [...booked, { id, partySize: 9, wantsGrill: "yes" as const, reservedAt: at, status: "pending" }];
    const allocations = planReservationAllocations({ reservations, occupiedTables, durationMinutes: 90, nowMs: now });
    assert.deepEqual(allocations.find(row => row.reservationId === id)?.labels, ["D2", "D3"]);
    assert.equal(evaluateReservationCapacity(input({ reservations })).availability, "full");
    assert.equal(evaluateReservationCapacity(input({ reservations, partySize: 4 })).availability, "full");
    assert.notEqual(evaluateReservationCapacity(input({ reservations, excludeReservationId: id })).availability, "full");
  }
});

test("a single free four-seat table still admits four, but not five or nine", () => {
  const reservations = [...booked, { id: "d3", tableLabel: "D3", partySize: 4, reservedAt: at, status: "confirmed" }];
  assert.notEqual(evaluateReservationCapacity(input({ reservations, partySize: 4 })).availability, "full");
  assert.equal(evaluateReservationCapacity(input({ reservations, partySize: 5 })).availability, "full");
});

test("ordinary large-table suggestions retain priority when a large table is free", () => {
  const reservations = booked.filter(row => row.tableLabel !== "D1");
  const result = evaluateReservationCapacity(input({ reservations }));
  assert.equal(result.recommendationLabel, "D1");
  assert.equal(result.capacity, 10);
});

test("guest slot results remain bookable, and live availability protects both physical tables", () => {
  const slots = evaluateSlotsForGuest({ dateIso: "2026-11-14", times: ["19:00"], partySize: 9,
    grill: "yes", reservations: booked, occupiedTables });
  assert.notEqual(slots[0].result.guestStatus, "full");
  const reservations = [...booked, { id: "guest-9", partySize: 9, reservedAt: at, status: "pending" }];
  const live = calculateTableAvailability({ serverNow: new Date(now).toISOString(), durationMinutes: 90, bufferMinutes: 0,
    reservations, tables: RESERVATION_FLOOR_TABLES.map(table => ({ ...table, id: table.label,
      occupied: false, occupiedAt: null, blocked: false })) });
  for (const label of ["D2", "D3"]) {
    assert.equal(live.tables.find(table => table.label === label)?.status, "reserved");
    assert.equal(live.tables.find(table => table.label === label)?.availableUntil, Date.parse(at));
  }
});
