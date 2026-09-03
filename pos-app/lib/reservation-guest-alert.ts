import type { ReservationRecord, ReservationStatus } from "@/lib/types";

export const GUEST_RESERVATION_ALERT_CHANNEL = "pos-guest-reservation-alerts";
export const GUEST_RESERVATION_ALERT_EVENT = "guest-change";

export type GuestReservationAlertKind = "updated" | "cancelled";

export interface GuestReservationAlertPayload {
  kind: GuestReservationAlertKind;
  reservation: {
    id: string;
    guestName: string;
    guestPhone?: string | null;
    guestEmail?: string | null;
    partySize: number;
    reservedAt: string;
    status: ReservationStatus;
    notes?: string | null;
    bookingCode?: string | null;
    eventType?: string | null;
    source?: "reservation" | "walk_in";
  };
  previous?: {
    partySize?: number;
    reservedAt?: string;
    notes?: string | null;
  };
}

export function guestAlertToReservationRecord(
  payload: GuestReservationAlertPayload,
): ReservationRecord {
  const row = payload.reservation;
  const now = new Date();
  return {
    id: row.id,
    guestName: row.guestName,
    guestPhone: row.guestPhone ?? undefined,
    guestEmail: row.guestEmail ?? undefined,
    partySize: row.partySize,
    reservedAt: new Date(row.reservedAt),
    status: row.status,
    source: row.source ?? "reservation",
    notes: row.notes ?? undefined,
    createdAt: now,
    updatedAt: now,
    bookingCode: row.bookingCode ?? undefined,
    eventType: row.eventType ?? undefined,
  };
}
