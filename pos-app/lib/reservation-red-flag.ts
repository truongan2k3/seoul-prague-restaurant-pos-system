import type { LanguageCode, ReservationStatus } from "@/lib/types";
import { cancelReasonLabel } from "@/lib/reservation-cancel-reasons";

export type RedFlagIncidentType =
  | "no_show"
  | "late_cancellation"
  | "customer_cancellation";

export interface RedFlagIncident {
  type: RedFlagIncidentType;
  reservationId: string;
  reservedAt: Date;
  cancelledAt?: Date;
  minutesBeforeBooking?: number; // e.g. 45 = cancelled 45m before booking, -10 = cancelled 10m after
  reasonId?: string;
  reasonLabel?: string;
  note?: string;
  partySize: number;
  guestName: string;
  cancelledBy?: string;
}

export interface GuestRedFlagReport {
  hasRedFlag: boolean;
  noShowCount: number;
  lateCancelCount: number;
  customerCancelCount: number;
  totalIncidents: number;
  incidents: RedFlagIncident[];
  severity: "critical" | "warning" | "none";
}

export const EMPTY_RED_FLAG_REPORT: GuestRedFlagReport = {
  hasRedFlag: false,
  noShowCount: 0,
  lateCancelCount: 0,
  customerCancelCount: 0,
  totalIncidents: 0,
  incidents: [],
  severity: "none",
};

/** Late cancellation threshold: 2 hours (120 minutes) before reservation time. */
export const LATE_CANCELLATION_THRESHOLD_MINUTES = 120;

/** Cancellation reasons that are strictly customer-initiated / customer reasons. */
export const CUSTOMER_CANCEL_REASON_IDS = new Set([
  "customer",
  "changed_mind",
  "booking_mistake",
]);

/** Reasons that are restaurant/system limitations (NOT customer red flags). */
export const RESTAURANT_CANCEL_REASON_IDS = new Set([
  "capacity",
  "closed",
  "time",
  "duplicate",
  "info",
]);

export function isCustomerCancellation(
  cancelledBy?: string | null,
  cancellationReason?: string | null,
): boolean {
  if (cancellationReason && RESTAURANT_CANCEL_REASON_IDS.has(cancellationReason)) {
    return false;
  }
  if (cancelledBy === "guest") return true;
  if (cancellationReason && CUSTOMER_CANCEL_REASON_IDS.has(cancellationReason)) return true;
  if (cancellationReason === "other" && cancelledBy === "guest") return true;
  return false;
}

export function checkLateCancellation(
  reservedAt: Date,
  cancelledAt?: Date | null,
): { isLate: boolean; minutesBefore: number | null } {
  if (!cancelledAt) return { isLate: false, minutesBefore: null };
  const diffMinutes = Math.round(
    (reservedAt.getTime() - cancelledAt.getTime()) / (60 * 1000),
  );
  // If cancelled within 2 hours (120m) before reservation or after reservation time has passed
  const isLate = diffMinutes <= LATE_CANCELLATION_THRESHOLD_MINUTES;
  return { isLate, minutesBefore: diffMinutes };
}

export type ReservationHistoryItem = {
  id: string;
  guest_name?: string | null;
  guest_phone?: string | null;
  guest_email?: string | null;
  party_size?: number | null;
  reserved_at: string | Date;
  status: ReservationStatus;
  cancelled_at?: string | Date | null;
  cancelled_by?: string | null;
  cancellation_reason?: string | null;
  cancellation_note?: string | null;
  updated_at?: string | Date | null;
};

/**
 * Evaluates whether a guest has past red flags (No-Shows, customer cancellations, late cancellations <= 2h).
 * Excludes the current reservation and any bookings strictly in the future relative to beforeAt cutoff.
 */
export function evaluateGuestRedFlags(
  reservations: ReservationHistoryItem[],
  options?: {
    excludeReservationId?: string | null;
    beforeAt?: string | Date | number | null;
  },
): GuestRedFlagReport {
  const cutoff = options?.beforeAt ? new Date(options.beforeAt).getTime() : Date.now();
  const incidents: RedFlagIncident[] = [];

  for (const row of reservations) {
    if (options?.excludeReservationId && row.id === options.excludeReservationId) {
      continue;
    }
    const reservedAt = new Date(row.reserved_at);
    if (!Number.isFinite(reservedAt.getTime())) continue;

    // We only evaluate incidents that happened prior to the cutoff
    if (reservedAt.getTime() >= cutoff) continue;

    const partySize = Math.max(1, row.party_size ?? 1);
    const guestName = row.guest_name || "Guest";

    if (row.status === "no_show") {
      incidents.push({
        type: "no_show",
        reservationId: row.id,
        reservedAt,
        partySize,
        guestName,
      });
      continue;
    }

    if (row.status === "cancelled") {
      const isCustomer = isCustomerCancellation(row.cancelled_by, row.cancellation_reason);
      if (!isCustomer) continue;

      const cancelledAtDate = row.cancelled_at
        ? new Date(row.cancelled_at)
        : row.updated_at
          ? new Date(row.updated_at)
          : undefined;

      const { isLate, minutesBefore } = checkLateCancellation(reservedAt, cancelledAtDate);

      incidents.push({
        type: isLate ? "late_cancellation" : "customer_cancellation",
        reservationId: row.id,
        reservedAt,
        cancelledAt: cancelledAtDate,
        minutesBeforeBooking: minutesBefore ?? undefined,
        reasonId: row.cancellation_reason ?? undefined,
        reasonLabel: cancelReasonLabel(row.cancellation_reason),
        note: row.cancellation_note?.trim() || undefined,
        partySize,
        guestName,
        cancelledBy: row.cancelled_by ?? undefined,
      });
    }
  }

  // Sort incidents descending by reservation date (most recent first)
  incidents.sort((a, b) => b.reservedAt.getTime() - a.reservedAt.getTime());

  const noShowCount = incidents.filter((i) => i.type === "no_show").length;
  const lateCancelCount = incidents.filter((i) => i.type === "late_cancellation").length;
  const customerCancelCount = incidents.filter((i) => i.type === "customer_cancellation").length;
  const totalIncidents = incidents.length;

  const severity: GuestRedFlagReport["severity"] =
    noShowCount > 0 || lateCancelCount > 0
      ? "critical"
      : customerCancelCount > 0
        ? "warning"
        : "none";

  return {
    hasRedFlag: totalIncidents > 0,
    noShowCount,
    lateCancelCount,
    customerCancelCount,
    totalIncidents,
    incidents,
    severity,
  };
}

/** Formats duration into human readable string, e.g. "45m" / "1h 30m" */
export function formatMinutesBefore(minutes: number, language: LanguageCode): string {
  if (minutes <= 0) {
    if (language === "vi") return "đúng/sau giờ đặt";
    if (language === "cs") return "po čase rezervace";
    return "at/after booking time";
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours > 0 && remMinutes > 0) {
    if (language === "vi") return `${hours}h ${remMinutes}m`;
    if (language === "cs") return `${hours} hod ${remMinutes} min`;
    return `${hours}h ${remMinutes}m`;
  }
  if (hours > 0) {
    if (language === "vi") return `${hours} tiếng`;
    if (language === "cs") return `${hours} hod`;
    return `${hours}h`;
  }
  if (language === "vi") return `${remMinutes} phút`;
  if (language === "cs") return `${remMinutes} min`;
  return `${remMinutes}m`;
}

/** Detailed localized description for a single Red Flag incident */
export function formatRedFlagIncidentDescription(
  incident: RedFlagIncident,
  language: LanguageCode,
): string {
  const locale = language === "cs" ? "cs-CZ" : language === "vi" ? "vi-VN" : "en-GB";
  const dateStr = incident.reservedAt.toLocaleDateString(locale, {
    timeZone: "Europe/Prague",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timeStr = incident.reservedAt.toLocaleTimeString(locale, {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (incident.type === "no_show") {
    if (language === "vi") {
      return `No-Show (không đến): ngày ${dateStr} lúc ${timeStr} (${incident.partySize} khách)`;
    }
    if (language === "cs") {
      return `Nedorazil (No-Show): dne ${dateStr} v ${timeStr} (${incident.partySize} hostů)`;
    }
    return `No-Show: on ${dateStr} at ${timeStr} (${incident.partySize} guests)`;
  }

  if (incident.type === "late_cancellation") {
    const diffStr = incident.minutesBeforeBooking !== undefined
      ? formatMinutesBefore(incident.minutesBeforeBooking, language)
      : "< 2h";
    const reason = incident.reasonLabel ? ` · ${incident.reasonLabel}` : "";

    if (language === "vi") {
      return `Hủy sát giờ (${diffStr} trước giờ đặt): ngày ${dateStr} lúc ${timeStr}${reason}`;
    }
    if (language === "cs") {
      return `Zrušeno na poslední chvíli (${diffStr} předem): dne ${dateStr} v ${timeStr}${reason}`;
    }
    return `Late cancellation (${diffStr} before booking): on ${dateStr} at ${timeStr}${reason}`;
  }

  // Regular customer cancellation
  const reason = incident.reasonLabel ? ` · ${incident.reasonLabel}` : "";
  if (language === "vi") {
    return `Khách hủy bàn: ngày ${dateStr} lúc ${timeStr}${reason}`;
  }
  if (language === "cs") {
    return `Zrušeno hostem: dne ${dateStr} v ${timeStr}${reason}`;
  }
  return `Customer cancellation: on ${dateStr} at ${timeStr}${reason}`;
}

/** Short summary string for pills and badges */
export function formatRedFlagSummary(
  report: GuestRedFlagReport,
  language: LanguageCode,
): string {
  const parts: string[] = [];
  if (report.noShowCount > 0) {
    parts.push(
      language === "vi"
        ? `${report.noShowCount}x No-Show`
        : language === "cs"
          ? `${report.noShowCount}x No-Show`
          : `${report.noShowCount}x No-Show`,
    );
  }
  if (report.lateCancelCount > 0) {
    parts.push(
      language === "vi"
        ? `${report.lateCancelCount}x Hủy sát giờ (<2h)`
        : language === "cs"
          ? `${report.lateCancelCount}x Zrušeno na poslední chvíli`
          : `${report.lateCancelCount}x Late cancel (<2h)`,
    );
  }
  if (report.customerCancelCount > 0) {
    parts.push(
      language === "vi"
        ? `${report.customerCancelCount}x Khách hủy`
        : language === "cs"
          ? `${report.customerCancelCount}x Zrušeno hostem`
          : `${report.customerCancelCount}x Customer cancel`,
    );
  }
  return parts.join(" · ");
}
