import type { ReservationRecord, ReservationStatus, VisitSource } from "@/lib/types";
import { endOfDay, startOfDay } from "@/lib/summary-analytics";

export type ReservationPeriod = "today" | "week" | "month" | "upcoming" | "all" | "custom";

export interface ReservationDateRange {
  start: Date | null;
  end: Date | null;
}

/** Date windows for the reservation book — unlike sales, these include future days. */
export function getReservationPeriodRange(
  period: ReservationPeriod,
  customRange?: { from?: string; to?: string },
): ReservationDateRange {
  const now = new Date();

  if (period === "all") {
    return { start: null, end: null };
  }

  if (period === "upcoming") {
    return { start: startOfDay(now), end: null };
  }

  if (period === "today") {
    return { start: startOfDay(now), end: endOfDay(now) };
  }

  if (period === "week") {
    const start = startOfDay(now);
    const weekday = start.getDay();
    const mondayOffset = weekday === 0 ? 6 : weekday - 1;
    start.setDate(start.getDate() - mondayOffset);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start, end: endOfDay(end) };
  }

  if (period === "month") {
    const start = startOfDay(now);
    start.setDate(1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    return { start, end: endOfDay(end) };
  }

  const fromRaw = customRange?.from?.trim();
  const toRaw = customRange?.to?.trim() || fromRaw;
  const fromDate = fromRaw ? new Date(`${fromRaw}T12:00:00`) : now;
  const toDate = toRaw ? new Date(`${toRaw}T12:00:00`) : fromDate;
  const earlier = fromDate.getTime() <= toDate.getTime() ? fromDate : toDate;
  const later = fromDate.getTime() <= toDate.getTime() ? toDate : fromDate;
  return { start: startOfDay(earlier), end: endOfDay(later) };
}

export type ReservationStatusFilter =
  | "all"
  | "pending"
  | "confirmed"
  | "late"
  | "checked_in"
  | "no_show";

export interface ReservationStats {
  totalGuests: number;
  totalBookings: number;
  pendingConfirmation: number;
  checkedIn: number;
  walkIns: number;
  noShows: number;
  late: number;
}

export function filterReservationsByPeriod(
  reservations: ReservationRecord[],
  period: ReservationPeriod,
  customRange?: { from?: string; to?: string },
): ReservationRecord[] {
  const range = getReservationPeriodRange(period, customRange);
  return reservations.filter((row) => {
    const time = row.reservedAt.getTime();
    if (range.start && time < range.start.getTime()) return false;
    if (range.end && time > range.end.getTime()) return false;
    return true;
  });
}

export function filterReservationsByStatus(
  reservations: ReservationRecord[],
  statusFilter: ReservationStatusFilter,
): ReservationRecord[] {
  if (statusFilter === "all") return reservations;
  return reservations.filter((row) => row.status === statusFilter);
}

export function computeReservationStats(rows: ReservationRecord[]): ReservationStats {
  const active = rows.filter((row) => row.status !== "cancelled");

  return {
    totalGuests: active.reduce((sum, row) => sum + row.partySize, 0),
    totalBookings: rows.filter((row) => row.source === "reservation").length,
    pendingConfirmation: rows.filter((row) => row.status === "pending").length,
    checkedIn: rows.filter((row) => row.status === "checked_in").length,
    walkIns: rows.filter((row) => row.source === "walk_in").length,
    noShows: rows.filter((row) => row.status === "no_show").length,
    late: rows.filter((row) => row.status === "late").length,
  };
}

export function reservationStatusLabelKey(
  status: ReservationStatus,
):
  | "resStatusPending"
  | "resStatusConfirmed"
  | "resStatusCancelled"
  | "resStatusNoShow"
  | "resStatusCheckedIn"
  | "resStatusCompleted"
  | "resStatusLate" {
  const map = {
    pending: "resStatusPending",
    confirmed: "resStatusConfirmed",
    cancelled: "resStatusCancelled",
    no_show: "resStatusNoShow",
    checked_in: "resStatusCheckedIn",
    completed: "resStatusCompleted",
    late: "resStatusLate",
  } as const;
  return map[status];
}

export function canConfirmReservation(status: ReservationStatus): boolean {
  return status === "pending";
}

export function canCancelReservation(status: ReservationStatus): boolean {
  return status === "pending" || status === "confirmed" || status === "late";
}

export function canMarkNoShow(status: ReservationStatus): boolean {
  return status === "confirmed" || status === "late";
}

export function canCheckIn(status: ReservationStatus): boolean {
  return status === "confirmed" || status === "late";
}

export function canAssignTable(status: ReservationStatus): boolean {
  return status === "confirmed" || status === "checked_in" || status === "late";
}

export function canEditReservation(status: ReservationStatus): boolean {
  return status === "pending" || status === "confirmed" || status === "late" || status === "checked_in";
}

export function isWalkIn(source: VisitSource): boolean {
  return source === "walk_in";
}

export function isLateReservation(row: ReservationRecord): boolean {
  return row.status === "late";
}
