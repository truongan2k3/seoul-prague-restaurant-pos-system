import type { ReservationRecord, ReservationStatus } from "@/lib/types";

/** Minutes before reserved_at when the main-floor prep popup should appear. */
export const RESERVATION_REMINDER_MINUTES = 30;

const REMINDER_STATUSES = new Set<ReservationStatus>(["pending", "confirmed"]);

const DISMISSED_STORAGE_KEY = "pos-reservation-reminder-dismissed";

export function isReservationReminderCandidate(reservation: ReservationRecord): boolean {
  if (reservation.source === "walk_in") return false;
  return REMINDER_STATUSES.has(reservation.status);
}

/** True when reserved time is still upcoming and within the reminder window. */
export function isWithinReservationReminderWindow(
  reservedAt: Date,
  nowMs = Date.now(),
  windowMinutes = RESERVATION_REMINDER_MINUTES,
): boolean {
  const msUntil = reservedAt.getTime() - nowMs;
  if (msUntil <= 0) return false;
  return msUntil <= windowMinutes * 60 * 1000;
}

export function minutesUntilReservation(reservedAt: Date, nowMs = Date.now()): number {
  return Math.max(0, Math.ceil((reservedAt.getTime() - nowMs) / 60_000));
}

export function loadDismissedReservationReminderIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(DISMISSED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

export function persistDismissedReservationReminderIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore quota / private mode */
  }
}

export function pickNextReservationReminder(
  reservations: ReservationRecord[],
  dismissedIds: Set<string>,
  nowMs = Date.now(),
): ReservationRecord | null {
  const due = reservations
    .filter(
      (row) =>
        isReservationReminderCandidate(row) &&
        !dismissedIds.has(row.id) &&
        isWithinReservationReminderWindow(row.reservedAt, nowMs),
    )
    .sort((a, b) => a.reservedAt.getTime() - b.reservedAt.getTime());

  return due[0] ?? null;
}
