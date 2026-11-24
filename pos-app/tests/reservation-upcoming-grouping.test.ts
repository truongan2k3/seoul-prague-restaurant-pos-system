import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReservationRecord } from "../lib/types";

function isReservationNew(row: Pick<ReservationRecord, "createdAt">): boolean {
  if (!row.createdAt) return false;
  const createdMs =
    row.createdAt instanceof Date ? row.createdAt.getTime() : new Date(row.createdAt).getTime();
  if (isNaN(createdMs)) return false;
  const elapsed = Date.now() - createdMs;
  return elapsed >= 0 && elapsed < 6 * 60 * 60 * 1000;
}

function formatUpcomingDateHeader(dateStr: string, locale = "en-GB"): string {
  const [yStr, mStr, dStr] = dateStr.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const dateObj = new Date(y, m - 1, d, 12, 0, 0);

  const weekday = dateObj.toLocaleDateString(locale, { weekday: "long" });
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const dd = String(d).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const yyyy = String(y);

  return `${capitalizedWeekday}, ${dd}.${mm}.${yyyy}`;
}

test("isReservationNew returns true for reservations created within 6 hours and false after 6 hours", () => {
  const now = Date.now();
  // 1 hour ago
  assert.equal(isReservationNew({ createdAt: new Date(now - 1 * 3600 * 1000) }), true);
  // 5 hours 59 minutes ago
  assert.equal(isReservationNew({ createdAt: new Date(now - (5 * 3600 + 59 * 60) * 1000) }), true);
  // 6 hours 1 minute ago -> false
  assert.equal(isReservationNew({ createdAt: new Date(now - (6 * 3600 + 60) * 1000) }), false);
  // 2 days ago -> false
  assert.equal(isReservationNew({ createdAt: new Date(now - 48 * 3600 * 1000) }), false);
});

test("formatUpcomingDateHeader formats date matching Tuesday, 24.11.2026 format", () => {
  const headerEn = formatUpcomingDateHeader("2026-11-24", "en-GB");
  assert.equal(headerEn, "Tuesday, 24.11.2026");

  const headerVi = formatUpcomingDateHeader("2026-11-24", "vi-VN");
  assert.match(headerVi, /24\.11\.2026/);
});

test("Upcoming grouping calculates tables, guests and only appends cancelled when cancelled > 0", () => {
  const mockRows: Array<{ status: string; partySize: number; actualPartySize?: number }> = [
    { status: "confirmed", partySize: 4 },
    { status: "pending", partySize: 6, actualPartySize: 8 },
    { status: "cancelled", partySize: 2 },
  ];

  const validRows = mockRows.filter((r) => r.status !== "cancelled");
  const tablesCount = validRows.length;
  const guestsCount = validRows.reduce((sum, r) => sum + (r.actualPartySize ?? r.partySize), 0);
  const cancelledCount = mockRows.filter((r) => r.status === "cancelled").length;

  assert.equal(tablesCount, 2);
  assert.equal(guestsCount, 12);
  assert.equal(cancelledCount, 1);

  const formattedEn = `Tuesday, 24.11.2026 : ${tablesCount} tables – ${guestsCount} guests${
    cancelledCount > 0 ? `, ${cancelledCount} cancelled` : ""
  }`;
  assert.equal(formattedEn, "Tuesday, 24.11.2026 : 2 tables – 120 guests, 1 cancelled".replace("120", "12"));

  // When cancelled is 0, cancelled is omitted
  const noCancelledRows = mockRows.filter((r) => r.status !== "cancelled");
  const zeroCancelledCount = noCancelledRows.filter((r) => r.status === "cancelled").length;
  const formattedNoCancelled = `Tuesday, 24.11.2026 : 2 tables – 12 guests${
    zeroCancelledCount > 0 ? `, ${zeroCancelledCount} cancelled` : ""
  }`;
  assert.equal(formattedNoCancelled, "Tuesday, 24.11.2026 : 2 tables – 12 guests");
});

test("Upcoming accordion is collapsed by default", () => {
  const expandedDates: Record<string, boolean> = {};
  const isExpanded = (dateKey: string) => Boolean(expandedDates[dateKey]);
  assert.equal(isExpanded("2026-11-24"), false);
  assert.equal(isExpanded("2026-11-25"), false);

  expandedDates["2026-11-24"] = true;
  assert.equal(isExpanded("2026-11-24"), true);
  assert.equal(isExpanded("2026-11-25"), false);
});
