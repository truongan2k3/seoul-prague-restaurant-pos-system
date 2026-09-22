import type { ReservationRecord, ReservationStatus, VisitSource } from "@/lib/types";
import { endOfDay, startOfDay, toDateInputValue } from "@/lib/summary-analytics";

export type ReservationPeriod = "day" | "week" | "range" | "upcoming" | "all" | "today";

export interface ReservationDateRange {
  start: Date | null;
  end: Date | null;
}

export interface ReservationPeriodOptions {
  from?: string;
  to?: string;
  /** YYYY-MM-DD used for day/week navigation. */
  anchorDate?: string;
}

function parseIsoDate(iso: string | undefined, fallback: Date): Date {
  if (!iso?.trim()) return fallback;
  const parsed = new Date(`${iso.trim()}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function shiftIsoDate(iso: string, days: number): string {
  const date = parseIsoDate(iso, new Date());
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

/** Monday–Sunday (local) containing the given date. */
export function weekBoundsForDate(iso: string): { from: string; to: string } {
  const date = startOfDay(parseIsoDate(iso, new Date()));
  const weekday = date.getDay();
  const mondayOffset = weekday === 0 ? 6 : weekday - 1;
  date.setDate(date.getDate() - mondayOffset);
  const end = new Date(date);
  end.setDate(end.getDate() + 6);
  return { from: toDateInputValue(date), to: toDateInputValue(end) };
}

/** Date windows for the reservation book — unlike sales, these include future days. */
export function getReservationPeriodRange(
  period: ReservationPeriod,
  options?: ReservationPeriodOptions,
): ReservationDateRange {
  const now = new Date();
  const anchor = parseIsoDate(options?.anchorDate || options?.from, now);

  if (period === "all") {
    return { start: null, end: null };
  }

  if (period === "upcoming") {
    return { start: startOfDay(now), end: null };
  }

  if (period === "today" || period === "day") {
    return { start: startOfDay(anchor), end: endOfDay(anchor) };
  }

  if (period === "week") {
    const { from, to } = weekBoundsForDate(toDateInputValue(anchor));
    return {
      start: startOfDay(parseIsoDate(from, now)),
      end: endOfDay(parseIsoDate(to, now)),
    };
  }

  // range
  const fromRaw = options?.from?.trim();
  const toRaw = options?.to?.trim() || fromRaw;
  const fromDate = fromRaw ? parseIsoDate(fromRaw, now) : now;
  const toDate = toRaw ? parseIsoDate(toRaw, now) : fromDate;
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

/** Upcoming list only — still waiting / expected guests. */
const UPCOMING_STATUSES = new Set<ReservationStatus>(["pending", "confirmed", "late"]);

export function filterReservationsByPeriod(
  reservations: ReservationRecord[],
  period: ReservationPeriod,
  options?: ReservationPeriodOptions,
): ReservationRecord[] {
  const range = getReservationPeriodRange(period, options);
  return reservations.filter((row) => {
    const time = row.reservedAt.getTime();
    if (range.start && time < range.start.getTime()) return false;
    if (range.end && time > range.end.getTime()) return false;
    // Upcoming = actionable bookings only (not completed / cancelled / seated / no-show).
    if (period === "upcoming" && !UPCOMING_STATUSES.has(row.status)) return false;
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

/**
 * Day / today list order: actionable bookings first, finished ones last.
 * Within the same priority group, keep chronological reservedAt order.
 */
export function reservationDayListPriority(status: ReservationStatus): number {
  switch (status) {
    case "pending":
      return 0;
    case "confirmed":
      return 1;
    case "late":
      return 2;
    case "checked_in":
      return 3;
    case "completed":
      return 8;
    case "cancelled":
      return 9;
    case "no_show":
      return 10;
    default:
      return 5;
  }
}

export function sortReservationsForDayList(
  reservations: ReservationRecord[],
): ReservationRecord[] {
  return [...reservations].sort((a, b) => {
    const byStatus =
      reservationDayListPriority(a.status) - reservationDayListPriority(b.status);
    if (byStatus !== 0) return byStatus;
    return a.reservedAt.getTime() - b.reservedAt.getTime();
  });
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

/** Colored status pills for reservation lists / tickers. */
export function reservationStatusTone(status: ReservationStatus): string {
  switch (status) {
    case "pending":
      return "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-300/70 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-700/60";
    case "confirmed":
      return "bg-emerald-100 text-emerald-900 ring-1 ring-inset ring-emerald-300/70 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-700/60";
    case "checked_in":
      return "bg-sky-100 text-sky-900 ring-1 ring-inset ring-sky-300/70 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-700/60";
    case "late":
      return "bg-orange-100 text-orange-950 ring-1 ring-inset ring-orange-400/80 dark:bg-orange-950 dark:text-orange-100 dark:ring-orange-600/70";
    case "no_show":
      return "bg-rose-100 text-rose-900 ring-1 ring-inset ring-rose-300/70 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-700/60";
    case "cancelled":
      return "bg-zinc-200 text-zinc-700 ring-1 ring-inset ring-zinc-300/80 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-600/60";
    case "completed":
      return "bg-violet-100 text-violet-900 ring-1 ring-inset ring-violet-300/70 dark:bg-violet-950 dark:text-violet-200 dark:ring-violet-700/60";
    default:
      return "bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-300/70 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-600/60";
  }
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
