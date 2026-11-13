import { cancelReasonLabel } from "@/lib/reservation-cancel-reasons";
import { splitVenueWallTime } from "@/lib/venue-timezone";

export interface ReservationNotificationSnapshot {
  partySize?: number;
  reservedAt?: string | Date;
  guestName?: string;
  guestPhone?: string | null;
  guestEmail?: string | null;
  eventType?: string | null;
  notes?: string | null;
}

export interface ReservationNotificationRecord extends ReservationNotificationSnapshot {
  cancellationReason?: string | null;
  cancellationNote?: string | null;
  cancelledBy?: string | null;
}

const short = (value: string, limit = 140) => value.replace(/\s+/g, " ").trim().slice(0, limit);

export function cancellationReasonPhrase(reason?: string | null): string {
  return reason ? short(cancelReasonLabel(reason), 100).toLowerCase() : "an unspecified reason";
}

/** Shared by foreground alerts and background phone push. Time comparisons use
 * Prague wall time, including daylight saving, instead of the device timezone. */
export function reservationUpdateDetails(next: ReservationNotificationSnapshot, previous?: ReservationNotificationSnapshot): string[] {
  if (!previous) return [];
  const details: string[] = [];
  if (previous.partySize != null && next.partySize != null && previous.partySize !== next.partySize) details.push(`Party size: ${previous.partySize} → ${next.partySize}`);
  if (previous.reservedAt && next.reservedAt && Number.isFinite(new Date(previous.reservedAt).getTime()) && Number.isFinite(new Date(next.reservedAt).getTime())) {
    const before = splitVenueWallTime(previous.reservedAt), after = splitVenueWallTime(next.reservedAt);
    if (before.date !== after.date) details.push(`Date: ${before.date} → ${after.date}`);
    if (before.time !== after.time) details.push(`Time: ${before.time} → ${after.time}`);
  }
  if (previous.guestName !== undefined && next.guestName !== undefined && previous.guestName !== next.guestName) details.push(`Guest name: ${short(previous.guestName, 60)} → ${short(next.guestName, 60)}`);
  // Contact values and free-form booking notes stay out of phone lock-screen copy.
  for (const [key, label] of [["guestPhone", "Phone"], ["guestEmail", "Email"], ["notes", "Notes"], ["eventType", "Visit occasion"]] as const) {
    if (Object.hasOwn(previous, key) && (previous[key] ?? "") !== (next[key] ?? "")) details.push(`${label} updated`);
  }
  return details;
}

export function reservationNotificationDetails(kind: string, next: ReservationNotificationRecord, previous?: ReservationNotificationSnapshot): string {
  if (kind === "updated") return reservationUpdateDetails(next, previous).join(" · ");
  if (kind !== "cancelled") return "";
  return [`Due to ${cancellationReasonPhrase(next.cancellationReason)}`,
    next.cancellationNote?.trim() ? `Details: ${short(next.cancellationNote)}` : "",
    next.cancelledBy?.trim() ? `Cancelled by: ${short(next.cancelledBy, 80)}` : ""].filter(Boolean).join(" · ");
}
