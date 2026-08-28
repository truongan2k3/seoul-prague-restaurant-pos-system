import type { ReservationStatus, TableStatus } from "@/lib/types";

export const RESERVATION_UNDO_MS = 60_000;

export type ReservationUndoAction = "assign" | "check_in" | "cancel";

export interface ReservationSnapshot {
  id: string;
  status: ReservationStatus;
  tableId: string | null;
  checkedInAt: string | null;
  completedAt: string | null;
}

export interface TableSnapshot {
  id: string;
  status: TableStatus;
  occupiedAt: string | null;
}

export interface ReservationUndoEntry {
  id: string;
  action: ReservationUndoAction;
  reservation: ReservationSnapshot;
  table?: TableSnapshot;
  expiresAt: number;
}

export function reservationUndoRemainingMs(entry: ReservationUndoEntry, now = Date.now()): number {
  return Math.max(0, entry.expiresAt - now);
}

export function isReservationUndoActive(entry: ReservationUndoEntry | null, now = Date.now()): entry is ReservationUndoEntry {
  return entry != null && reservationUndoRemainingMs(entry, now) > 0;
}
