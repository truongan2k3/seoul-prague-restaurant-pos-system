import type { ReservationRecord, ReservationStatus, VisitSource } from "@/lib/types";
import { getPeriodRange, type SummaryPeriod } from "@/lib/summary-analytics";

export type ReservationPeriod = Exclude<SummaryPeriod, "yesterday" | "custom">;

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
): ReservationRecord[] {
  const range = getPeriodRange(period);
  return reservations.filter(
    (row) =>
      row.reservedAt.getTime() >= range.start.getTime() &&
      row.reservedAt.getTime() <= range.end.getTime(),
  );
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

export function isWalkIn(source: VisitSource): boolean {
  return source === "walk_in";
}

export function isLateReservation(row: ReservationRecord): boolean {
  return row.status === "late";
}
