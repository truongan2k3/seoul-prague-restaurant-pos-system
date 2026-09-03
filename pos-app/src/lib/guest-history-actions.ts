import {
  guestIdentityMatches,
  normalizeEmail,
  phoneLookupTail,
} from "@/lib/guest-identity";
import type { ReservationStatus } from "@/lib/types";
import { supabase } from "@/src/lib/supabase";

export type GuestVisitKind = "reservation" | "sale";

export interface GuestVisitEntry {
  id: string;
  kind: GuestVisitKind;
  at: string;
  guestName: string;
  partySize?: number;
  tableLabel?: string;
  status?: ReservationStatus;
}

export interface GuestVisitProfile {
  /** Prior visits excluding the current reservation (if any). */
  priorVisitCount: number;
  /** priorVisitCount + 1 — the visit number for the current booking. */
  currentVisitNumber: number;
  /** True when priorVisitCount >= 1. */
  isReturning: boolean;
  visits: GuestVisitEntry[];
}

const EMPTY_PROFILE: GuestVisitProfile = {
  priorVisitCount: 0,
  currentVisitNumber: 1,
  isReturning: false,
  visits: [],
};

const SKIP_RESERVATION_STATUSES = new Set<ReservationStatus>(["cancelled", "no_show"]);

function mapReservationVisit(row: {
  id: string;
  guest_name: string;
  party_size: number;
  reserved_at: string;
  status: ReservationStatus;
  tables?: { label: string } | { label: string }[] | null;
}): GuestVisitEntry {
  const tableJoin = row.tables;
  const tableLabel = Array.isArray(tableJoin) ? tableJoin[0]?.label : tableJoin?.label;
  return {
    id: row.id,
    kind: "reservation",
    at: row.reserved_at,
    guestName: row.guest_name,
    partySize: row.party_size,
    tableLabel,
    status: row.status,
  };
}

function mapSaleVisit(row: {
  id: string;
  guest_name: string | null;
  party_size: number | null;
  table_label: string | null;
  closed_at: string;
  reservation_id: string | null;
}): GuestVisitEntry & { reservationId?: string } {
  return {
    id: row.id,
    kind: "sale",
    at: row.closed_at,
    guestName: row.guest_name || "Guest",
    partySize: row.party_size ?? undefined,
    tableLabel: row.table_label ?? undefined,
    reservationId: row.reservation_id ?? undefined,
  };
}

/**
 * Look up prior visits for a guest by email and/or phone.
 * Matches reservations + closed sales; dedupes sale↔reservation links.
 */
export async function fetchGuestVisitProfile(input: {
  email?: string | null;
  phone?: string | null;
  excludeReservationId?: string | null;
}): Promise<{ data: GuestVisitProfile; error: string | null }> {
  const email = normalizeEmail(input.email);
  const phoneTail = phoneLookupTail(input.phone);

  if (!email && !phoneTail) {
    return { data: EMPTY_PROFILE, error: null };
  }

  const orParts: string[] = [];
  if (email) orParts.push(`guest_email.eq."${email.replace(/"/g, "")}"`);
  if (phoneTail) orParts.push(`guest_phone.ilike."%${phoneTail}%"`);

  const reservationQuery = supabase
    .from("reservations")
    .select("id, guest_name, guest_phone, guest_email, party_size, reserved_at, status, tables(label)")
    .or(orParts.join(","))
    .order("reserved_at", { ascending: false })
    .limit(80);

  const saleQuery = phoneTail
    ? supabase
        .from("sales")
        .select("id, guest_name, guest_phone, party_size, table_label, closed_at, reservation_id, deleted_at")
        .ilike("guest_phone", `%${phoneTail}%`)
        .is("deleted_at", null)
        .order("closed_at", { ascending: false })
        .limit(80)
    : null;

  const [reservationResult, saleResult] = await Promise.all([
    reservationQuery,
    saleQuery ?? Promise.resolve({ data: null as null, error: null as null }),
  ]);

  if (reservationResult.error) {
    return { data: EMPTY_PROFILE, error: reservationResult.error.message };
  }
  if (saleResult.error) {
    return { data: EMPTY_PROFILE, error: saleResult.error.message };
  }

  const identity = { email: input.email, phone: input.phone };

  const reservations = (reservationResult.data ?? []).filter((row) => {
    if (input.excludeReservationId && row.id === input.excludeReservationId) return false;
    if (SKIP_RESERVATION_STATUSES.has(row.status as ReservationStatus)) return false;
    return guestIdentityMatches(identity, {
      email: row.guest_email,
      phone: row.guest_phone,
    });
  });

  const sales = (saleResult.data ?? []).filter((row) =>
    guestIdentityMatches(identity, { phone: row.guest_phone }),
  );

  const reservationIdsCoveredBySales = new Set(
    sales.map((row) => row.reservation_id).filter((id): id is string => Boolean(id)),
  );

  const visits: GuestVisitEntry[] = [];

  for (const sale of sales) {
    const mapped = mapSaleVisit(sale);
    visits.push({
      id: mapped.id,
      kind: mapped.kind,
      at: mapped.at,
      guestName: mapped.guestName,
      partySize: mapped.partySize,
      tableLabel: mapped.tableLabel,
    });
  }

  for (const reservation of reservations) {
    if (reservationIdsCoveredBySales.has(reservation.id)) continue;
    visits.push(mapReservationVisit(reservation));
  }

  visits.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const priorVisitCount = visits.length;
  const profile: GuestVisitProfile = {
    priorVisitCount,
    currentVisitNumber: priorVisitCount + 1,
    isReturning: priorVisitCount >= 1,
    visits: visits.slice(0, 12),
  };

  return { data: profile, error: null };
}
