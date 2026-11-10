import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateTableAvailability, type TableAvailabilitySource } from "../lib/table-availability";

function snapshot(reservations: TableAvailabilitySource["reservations"]): TableAvailabilitySource {
  return {
    serverNow: "2026-11-10T17:00:00Z", durationMinutes: 90, bufferMinutes: 0,
    tables: [{ id: "d1", label: "D1", capacity: 4, grill: false,
      occupied: false, occupiedAt: null, blocked: false }],
    reservations,
  };
}

test("live summary ignores assigned and unassigned bookings on future days", () => {
  for (const reservation of [
    { reservedAt: "2026-11-11T18:00:00Z" },
    { reservedAt: "2026-11-13T18:00:00Z", tableLabel: "D1" },
  ]) {
    const table = calculateTableAvailability(snapshot([{ ...reservation, partySize: 3, status: "confirmed" }])).tables[0];
    assert.equal(table.availableUntil, null);
    assert.equal(table.availableNow, true);
    assert.equal(table.status, "available");
  }
});

test("unassigned bookings today still forecast a table and protect its seating window", () => {
  const source = snapshot([{ partySize: 3, status: "confirmed", reservedAt: "2026-11-10T18:00:00Z" }]);
  const table = calculateTableAvailability(source).tables[0];
  assert.equal(table.availableUntil, Date.parse("2026-11-10T18:00:00Z"));
  assert.equal(table.availableNow, true);
  assert.equal(table.status, "reserved");
  assert.equal(calculateTableAvailability(source, Date.parse("2026-11-10T18:00:00Z")).tables[0].availableNow, false);
});

test("assigned bookings today set the deadline and protect their seating window", () => {
  const source = snapshot([{ partySize: 3, status: "confirmed", tableLabel: "D1", reservedAt: "2026-11-10T18:00:00Z" }]);
  assert.equal(calculateTableAvailability(source).tables[0].availableUntil, Date.parse("2026-11-10T18:00:00Z"));
  assert.equal(calculateTableAvailability(source, Date.parse("2026-11-10T18:00:00Z")).tables[0].availableNow, false);
});

test("day boundary uses Prague time and recalculates when the clock crosses midnight", () => {
  const source = snapshot([{ partySize: 3, status: "confirmed", tableLabel: "D1", reservedAt: "2026-11-10T23:30:00Z" }]);
  assert.equal(calculateTableAvailability(source, Date.parse("2026-11-10T22:45:00Z")).tables[0].availableUntil, null);
  assert.equal(calculateTableAvailability(source, Date.parse("2026-11-10T23:05:00Z")).tables[0].availableUntil, Date.parse("2026-11-10T23:30:00Z"));
});
