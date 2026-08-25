import type { ReservationRecord, ReservationStatus } from "@/lib/types";

export type ReservationReminderMode = "15" | "30" | "both";
export type ReservationReminderLead = 15 | 30;

const REMINDER_STATUSES = new Set<ReservationStatus>(["pending", "confirmed"]);

const DISMISSED_STORAGE_KEY = "pos-reservation-reminder-dismissed";

export function reminderLeadsForMode(mode: ReservationReminderMode): ReservationReminderLead[] {
  if (mode === "15") return [15];
  if (mode === "both") return [30, 15];
  return [30];
}

export function parseReservationReminderMode(value: unknown): ReservationReminderMode {
  if (value === "15" || value === "30" || value === "both") return value;
  return "30";
}

export function reminderDismissKey(reservationId: string, leadMinutes: ReservationReminderLead): string {
  return `${reservationId}:${leadMinutes}`;
}

export function isReservationReminderCandidate(reservation: ReservationRecord): boolean {
  if (reservation.source === "walk_in") return false;
  return REMINDER_STATUSES.has(reservation.status);
}

/** True when reserved time is still upcoming and within `leadMinutes`. */
export function isWithinReservationReminderLead(
  reservedAt: Date,
  leadMinutes: number,
  nowMs = Date.now(),
): boolean {
  const msUntil = reservedAt.getTime() - nowMs;
  if (msUntil <= 0) return false;
  return msUntil <= leadMinutes * 60 * 1000;
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

export interface ReservationReminderHit {
  reservation: ReservationRecord;
  leadMinutes: ReservationReminderLead;
  dismissKey: string;
}

/**
 * Next undismissed prep reminder. With mode "both", 30-min and 15-min are separate
 * (dismissing 30 still allows 15 later). Local-only — no network.
 */
export function pickNextReservationReminder(
  reservations: ReservationRecord[],
  dismissedKeys: Set<string>,
  mode: ReservationReminderMode = "30",
  nowMs = Date.now(),
): ReservationReminderHit | null {
  const leads = reminderLeadsForMode(mode);
  const hits: ReservationReminderHit[] = [];

  for (const row of reservations) {
    if (!isReservationReminderCandidate(row)) continue;
    for (const lead of leads) {
      const dismissKey = reminderDismissKey(row.id, lead);
      if (dismissedKeys.has(dismissKey)) continue;
      // Legacy: older builds stored bare reservation id after OK.
      if (dismissedKeys.has(row.id)) continue;
      if (!isWithinReservationReminderLead(row.reservedAt, lead, nowMs)) continue;
      hits.push({ reservation: row, leadMinutes: lead, dismissKey });
    }
  }

  hits.sort((a, b) => {
    const byTime = a.reservation.reservedAt.getTime() - b.reservation.reservedAt.getTime();
    if (byTime !== 0) return byTime;
    return b.leadMinutes - a.leadMinutes;
  });

  return hits[0] ?? null;
}
