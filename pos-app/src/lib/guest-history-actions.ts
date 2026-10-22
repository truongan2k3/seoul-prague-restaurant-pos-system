import { guestIdentityMatches, normalizeEmail, phoneLookupTail } from "@/lib/guest-identity";
import type { ReservationStatus } from "@/lib/types";
import { supabase } from "@/src/lib/supabase";

export type GuestVisitKind = "reservation" | "sale";
export interface GuestVisitEntry {
  id: string; kind: GuestVisitKind; at: string; guestName: string;
  partySize?: number; tableLabel?: string; status?: ReservationStatus;
}
export interface GuestVisitProfile {
  priorVisitCount: number; currentVisitNumber: number; isReturning: boolean; visits: GuestVisitEntry[];
}
export type GuestVisitLookup = {
  email?: string | null; phone?: string | null; excludeReservationId?: string | null;
  beforeAt?: string | Date | null;
};
const EMPTY_PROFILE: GuestVisitProfile = { priorVisitCount: 0, currentVisitNumber: 1, isReturning: false, visits: [] };
const VISITED = new Set<ReservationStatus>(["checked_in", "completed"]);
type ReservationHistory = {
  id: string; guest_name: string; guest_email: string | null; guest_phone: string | null;
  party_size: number; reserved_at: string; checked_in_at: string | null; status: ReservationStatus;
  tables: { label: string } | { label: string }[] | null;
};
type SaleHistory = {
  id: string; table_id: string | null; guest_name: string | null; guest_phone: string | null;
  party_size: number | null; table_label: string | null; closed_at: string; seated_at: string | null;
  reservation_id: string | null;
};
type History = { reservations: ReservationHistory[]; sales: SaleHistory[] };
const PAGE_SIZE = 100;
const CACHE_MS = 30_000;
const historyCache = new Map<string, { expires: number; history: History }>();
const pendingHistory = new Map<string, Promise<History>>();

export function guestVisitProfileKey(input: GuestVisitLookup): string {
  const before = input.beforeAt ? new Date(input.beforeAt).getTime() : null;
  return JSON.stringify([normalizeEmail(input.email), input.phone?.replace(/\D/g, "") ?? null,
    input.excludeReservationId ?? null, Number.isFinite(before) ? before : null]);
}

function quotedFilter(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
async function allPages<T>(page: (from: number, to: number) => PromiseLike<{
  data: T[] | null; error: { message: string } | null;
}>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await page(from, from + PAGE_SIZE - 1);
    if (result.error) throw new Error(result.error.message);
    rows.push(...(result.data ?? []));
    if (!result.data || result.data.length < PAGE_SIZE) return rows;
  }
}

async function loadHistory(email: string | null, phone: string | null): Promise<History> {
  const tail = phoneLookupTail(phone);
  // Match formatted phones in SQL; exact normalized identity is checked below.
  const phonePattern = tail ? `%${tail.split("").join("%")}%` : null;
  const identityFilters: string[] = [];
  if (email) identityFilters.push(`guest_email.ilike.${quotedFilter(email.replace(/[\\%_]/g, "\\$&"))}`);
  if (phonePattern) identityFilters.push(`guest_phone.ilike.${quotedFilter(phonePattern)}`);
  const candidates = await allPages<ReservationHistory>((from, to) => supabase.from("reservations")
    .select("id, guest_name, guest_phone, guest_email, party_size, reserved_at, checked_in_at, status, tables!table_id(label)")
    .or(identityFilters.join(",")).order("reserved_at", { ascending: false }).order("id", { ascending: false }).range(from, to));
  const reservations = candidates.filter((row) => guestIdentityMatches({ email, phone }, { email: row.guest_email, phone: row.guest_phone }));
  const linkedIds = reservations.map((row) => row.id);
  const linkedSet = new Set(linkedIds);
  const saleRows = new Map<string, SaleHistory>();
  // Include linked bills for email-only guests, and deduplicate overlapping query results.
  for (let offset = 0; offset < Math.max(linkedIds.length, phonePattern ? 1 : 0); offset += 80) {
    const filters: string[] = [];
    if (offset === 0 && phonePattern) filters.push(`guest_phone.ilike.${quotedFilter(phonePattern)}`);
    const ids = linkedIds.slice(offset, offset + 80);
    if (ids.length) filters.push(`reservation_id.in.(${ids.join(",")})`);
    const sales = await allPages<SaleHistory>((from, to) => supabase.from("sales")
      .select("id, table_id, guest_name, guest_phone, party_size, table_label, closed_at, seated_at, reservation_id")
      .or(filters.join(",")).is("deleted_at", null)
      .order("closed_at", { ascending: false }).order("id", { ascending: false }).range(from, to));
    for (const sale of sales) {
      if ((sale.reservation_id && linkedSet.has(sale.reservation_id)) || guestIdentityMatches({ phone }, { phone: sale.guest_phone })) saleRows.set(sale.id, sale);
    }
  }
  return { reservations, sales: [...saleRows.values()] };
}
async function historyFor(email: string | null, phone: string | null): Promise<History> {
  const key = JSON.stringify([email, phone?.replace(/\D/g, "") ?? null]);
  const cached = historyCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.history;
  const pending = pendingHistory.get(key);
  if (pending) return pending;
  const request = loadHistory(email, phone).then((history) => {
    for (const [entry, value] of historyCache) if (value.expires <= Date.now()) historyCache.delete(entry);
    if (historyCache.size >= 100) historyCache.delete(historyCache.keys().next().value!);
    historyCache.set(key, { history, expires: Date.now() + CACHE_MS });
    return history;
  });
  pendingHistory.set(key, request);
  try { return await request; } finally { pendingHistory.delete(key); }
}

/** Count actual visits; exclude this booking and all of its split-payment receipts. */
export async function fetchGuestVisitProfile(input: GuestVisitLookup): Promise<{ data: GuestVisitProfile; error: string | null }> {
  const email = normalizeEmail(input.email), phone = phoneLookupTail(input.phone) ? input.phone ?? null : null;
  if (!email && !phone) return { data: EMPTY_PROFILE, error: null };
  try {
    const history = await historyFor(email, phone);
    const requestedBefore = input.beforeAt ? new Date(input.beforeAt).getTime() : NaN;
    const cutoff = Math.min(Date.now(), Number.isFinite(requestedBefore) ? requestedBefore : Date.now());
    const priorSales = history.sales.filter((sale) => (!input.excludeReservationId || sale.reservation_id !== input.excludeReservationId)
      && new Date(sale.closed_at).getTime() < cutoff);
    const physicalVisit = (sale: SaleHistory) => sale.seated_at && Number.isFinite(new Date(sale.seated_at).getTime()) && (sale.table_id || sale.table_label)
      ? `visit:${sale.table_id || sale.table_label}:${sale.seated_at}` : null;
    const currentVisitKeys = new Set(history.sales.filter((sale) => input.excludeReservationId && sale.reservation_id === input.excludeReservationId)
      .map(physicalVisit).filter((key): key is string => key !== null));
    const reservationVisitKeys = new Map<string, string>();
    for (const sale of priorSales) {
      const key = physicalVisit(sale);
      if (sale.reservation_id && key && !reservationVisitKeys.has(sale.reservation_id)) reservationVisitKeys.set(sale.reservation_id, key);
    }
    const byVisit = new Map<string, GuestVisitEntry>();
    const coveredReservations = new Set<string>();
    for (const sale of priorSales) {
      const physical = physicalVisit(sale);
      if (physical && currentVisitKeys.has(physical)) continue;
      if (sale.reservation_id) coveredReservations.add(sale.reservation_id);
      const key = sale.reservation_id ? reservationVisitKeys.get(sale.reservation_id) ?? `reservation:${sale.reservation_id}`
        : physical ?? `sale:${sale.id}`;
      if (byVisit.has(key)) continue;
      byVisit.set(key, { id: sale.id, kind: "sale", at: sale.seated_at && Number.isFinite(new Date(sale.seated_at).getTime()) ? sale.seated_at : sale.closed_at,
        guestName: sale.guest_name || "Guest", partySize: sale.party_size ?? undefined, tableLabel: sale.table_label ?? undefined });
    }
    for (const row of history.reservations) {
      if (row.id === input.excludeReservationId || !VISITED.has(row.status) || coveredReservations.has(row.id)) continue;
      const at = row.checked_in_at ?? row.reserved_at;
      const arrivedAt = new Date(at).getTime();
      if (!Number.isFinite(arrivedAt) || arrivedAt >= cutoff) continue;
      const table = Array.isArray(row.tables) ? row.tables[0] : row.tables;
      byVisit.set(`reservation:${row.id}`, { id: row.id, kind: "reservation", at,
        guestName: row.guest_name, partySize: row.party_size, tableLabel: table?.label, status: row.status });
    }
    const visits = [...byVisit.values()].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return { data: { priorVisitCount: visits.length, currentVisitNumber: visits.length + 1, isReturning: visits.length > 0, visits: visits.slice(0, 12) }, error: null };
  } catch (error) {
    return { data: EMPTY_PROFILE, error: error instanceof Error ? error.message : "Could not load guest history." };
  }
}
