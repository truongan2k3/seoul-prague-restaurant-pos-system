import type { ReservationRecord, ReservationStatus } from "@/lib/types";

/** Status transitions that should not trigger staff popup / browser alerts. */
const SILENT_STATUSES: ReservationStatus[] = ["checked_in", "completed", "late"];

export type ReservationChangeAlertKind = "new" | "updated" | "cancelled" | "no_show";

export function isSilentReservationStatus(status: ReservationStatus): boolean {
  return SILENT_STATUSES.includes(status);
}

/** Walk-ins and check-ins should never popup. */
export function shouldAlertOnReservationInsert(reservation: ReservationRecord): boolean {
  if (reservation.source === "walk_in") return false;
  if (isSilentReservationStatus(reservation.status)) return false;
  return true;
}

/**
 * Decide whether an UPDATE should alert staff.
 * Skips check-in, completed (after seated), and auto late marks.
 */
export function classifyReservationUpdate(
  previous: ReservationRecord | undefined,
  next: ReservationRecord,
): ReservationChangeAlertKind | null {
  if (next.source === "walk_in" && (!previous || previous.source === "walk_in")) {
    return null;
  }

  // Check-in (and anything arriving as checked_in) — never alert.
  if (next.status === "checked_in") return null;
  if (previous?.status === "checked_in" && next.status === "completed") return null;
  if (next.status === "completed" && previous?.status !== "cancelled") {
    // Completing a seated visit is operational noise.
    if (!previous || previous.status === "checked_in" || previous.status === "completed") {
      return null;
    }
  }

  // Auto late marker — no popup.
  if (next.status === "late") {
    if (!previous || previous.status === "confirmed" || previous.status === "pending") {
      return null;
    }
  }
  if (previous?.status === "late" && next.status === "confirmed") {
    // Undo late → confirmed without other edits: skip if fields identical.
    if (!hasMeaningfulReservationFieldChange(previous, next)) return null;
  }

  if (next.status === "cancelled") return "cancelled";
  if (next.status === "no_show") return "no_show";

  if (!previous) {
    // No cache yet — still alert on non-silent updates (e.g. guest edit).
    if (isSilentReservationStatus(next.status)) return null;
    return "updated";
  }

  if (previous.status !== next.status) {
    // pending → confirmed etc. still counts as a change staff may want.
    if (!isSilentReservationStatus(next.status)) return "updated";
  }

  if (hasMeaningfulReservationFieldChange(previous, next)) return "updated";
  return null;
}

export function hasMeaningfulReservationFieldChange(
  previous: ReservationRecord,
  next: ReservationRecord,
): boolean {
  if (previous.partySize !== next.partySize) return true;
  if (previous.guestName !== next.guestName) return true;
  if ((previous.guestPhone ?? "") !== (next.guestPhone ?? "")) return true;
  if ((previous.guestEmail ?? "") !== (next.guestEmail ?? "")) return true;
  if ((previous.notes ?? "") !== (next.notes ?? "")) return true;
  if ((previous.tableId ?? "") !== (next.tableId ?? "")) return true;
  if ((previous.eventType ?? "") !== (next.eventType ?? "")) return true;
  if (previous.reservedAt.getTime() !== next.reservedAt.getTime()) return true;
  return false;
}

export function reservationAlertDedupeKey(
  kind: ReservationChangeAlertKind,
  reservationId: string,
): string {
  return `${kind}:${reservationId}`;
}
