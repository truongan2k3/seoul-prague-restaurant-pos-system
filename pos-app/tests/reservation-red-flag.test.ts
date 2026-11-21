import assert from "node:assert/strict";
import { test } from "node:test";
import {
  evaluateGuestRedFlags,
  checkLateCancellation,
  isCustomerCancellation,
  formatRedFlagSummary,
  formatRedFlagIncidentDescription,
  LATE_CANCELLATION_THRESHOLD_MINUTES,
  type ReservationHistoryItem,
} from "../lib/reservation-red-flag";

test("checkLateCancellation accurately flags cancellations within 2 hours (120 minutes) or after", () => {
  const reservedAt = new Date("2026-11-20T18:00:00Z");

  // Cancelled 3 hours before -> NOT late
  const cancelled3h = new Date("2026-11-20T15:00:00Z");
  assert.equal(checkLateCancellation(reservedAt, cancelled3h).isLate, false);
  assert.equal(checkLateCancellation(reservedAt, cancelled3h).minutesBefore, 180);

  // Cancelled exactly 2 hours (120 minutes) before -> LATE
  const cancelled2h = new Date("2026-11-20T16:00:00Z");
  assert.equal(checkLateCancellation(reservedAt, cancelled2h).isLate, true);
  assert.equal(checkLateCancellation(reservedAt, cancelled2h).minutesBefore, 120);

  // Cancelled 45 minutes before -> LATE
  const cancelled45m = new Date("2026-11-20T17:15:00Z");
  assert.equal(checkLateCancellation(reservedAt, cancelled45m).isLate, true);
  assert.equal(checkLateCancellation(reservedAt, cancelled45m).minutesBefore, 45);

  // Cancelled 15 minutes AFTER reservation time -> LATE
  const cancelledAfter = new Date("2026-11-20T18:15:00Z");
  assert.equal(checkLateCancellation(reservedAt, cancelledAfter).isLate, true);
  assert.equal(checkLateCancellation(reservedAt, cancelledAfter).minutesBefore, -15);
});

test("isCustomerCancellation identifies guest-initiated vs restaurant-initiated reasons", () => {
  // Customer initiated
  assert.equal(isCustomerCancellation(undefined, "customer"), true);
  assert.equal(isCustomerCancellation(undefined, "changed_mind"), true);
  assert.equal(isCustomerCancellation(undefined, "booking_mistake"), true);
  assert.equal(isCustomerCancellation("guest", "anything"), true);

  // Restaurant initiated (must NOT blame guest)
  assert.equal(isCustomerCancellation("staff", "capacity"), false);
  assert.equal(isCustomerCancellation(undefined, "closed"), false);
  assert.equal(isCustomerCancellation(undefined, "duplicate"), false);
  assert.equal(isCustomerCancellation(undefined, "time"), false);
  assert.equal(isCustomerCancellation(undefined, "info"), false);
  assert.equal(isCustomerCancellation("restaurant", "other"), false);
});

test("evaluateGuestRedFlags flags No-Show, Late Cancellation, and Customer Cancellation", () => {
  const history: ReservationHistoryItem[] = [
    // 1. Past No-Show
    {
      id: "res-1",
      guest_name: "Nguyen Van A",
      party_size: 4,
      reserved_at: "2026-11-10T18:00:00Z",
      status: "no_show",
    },
    // 2. Late cancellation (1 hour before, customer requested)
    {
      id: "res-2",
      guest_name: "Nguyen Van A",
      party_size: 2,
      reserved_at: "2026-11-15T19:00:00Z",
      status: "cancelled",
      cancelled_at: "2026-11-15T18:00:00Z",
      cancellation_reason: "changed_mind",
      cancellation_note: "Had an emergency",
    },
    // 3. Early customer cancellation (2 days before)
    {
      id: "res-3",
      guest_name: "Nguyen Van A",
      party_size: 6,
      reserved_at: "2026-11-18T18:30:00Z",
      status: "cancelled",
      cancelled_at: "2026-11-16T12:00:00Z",
      cancellation_reason: "customer",
    },
    // 4. Restaurant cancellation (capacity full) -> should NOT count as red flag
    {
      id: "res-4",
      guest_name: "Nguyen Van A",
      party_size: 2,
      reserved_at: "2026-11-17T18:30:00Z",
      status: "cancelled",
      cancelled_at: "2026-11-17T14:00:00Z",
      cancellation_reason: "capacity",
      cancelled_by: "restaurant",
    },
  ];

  const report = evaluateGuestRedFlags(history);
  assert.equal(report.hasRedFlag, true);
  assert.equal(report.noShowCount, 1);
  assert.equal(report.lateCancelCount, 1);
  assert.equal(report.customerCancelCount, 1);
  assert.equal(report.totalIncidents, 3);
  assert.equal(report.severity, "critical"); // No-show or late cancel triggers critical

  // Test summary string
  const summaryVi = formatRedFlagSummary(report, "vi");
  assert.match(summaryVi, /1x No-Show/);
  assert.match(summaryVi, /1x Hủy sát giờ/);
  assert.match(summaryVi, /1x Khách hủy/);

  const summaryEn = formatRedFlagSummary(report, "en");
  assert.match(summaryEn, /1x No-Show/);
  assert.match(summaryEn, /1x Late cancel/);
  assert.match(summaryEn, /1x Customer cancel/);

  // Test incident descriptions
  const lateIncident = report.incidents.find((i) => i.type === "late_cancellation");
  assert.ok(lateIncident);
  assert.equal(lateIncident?.minutesBeforeBooking, 60);
  const descVi = formatRedFlagIncidentDescription(lateIncident!, "vi");
  assert.match(descVi, /Hủy sát giờ/);
  assert.match(descVi, /1 tiếng trước giờ đặt/);
});

test("evaluateGuestRedFlags respects excludeReservationId and cutoff", () => {
  const history: ReservationHistoryItem[] = [
    {
      id: "res-target",
      guest_name: "Nguyen Van A",
      party_size: 4,
      reserved_at: "2026-11-21T18:00:00Z",
      status: "no_show",
    },
  ];

  // If excluded, no red flag reported
  const reportExcluded = evaluateGuestRedFlags(history, { excludeReservationId: "res-target" });
  assert.equal(reportExcluded.hasRedFlag, false);

  // If after cutoff, no red flag reported
  const reportCutoff = evaluateGuestRedFlags(history, {
    beforeAt: new Date("2026-11-20T00:00:00Z"),
  });
  assert.equal(reportCutoff.hasRedFlag, false);
});
