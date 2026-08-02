import type {
  ReservationRecord,
  ReservationStatus,
  VisitSource,
} from "@/lib/types";
import { supabase } from "@/src/lib/supabase";

export interface CreateReservationInput {
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  partySize: number;
  reservedAt: Date;
  notes?: string;
  staffId?: string;
  staffName?: string;
  source?: VisitSource;
  tableId?: string;
  status?: ReservationStatus;
}

function nowIso() {
  return new Date().toISOString();
}

export async function fetchReservations(since?: Date) {
  let query = supabase
    .from("reservations")
    .select("*, tables(label)")
    .order("reserved_at", { ascending: true });

  if (since) {
    query = query.gte("reserved_at", since.toISOString());
  }

  return query;
}

export async function createReservation(input: CreateReservationInput) {
  const status = input.status ?? (input.source === "walk_in" ? "checked_in" : "pending");

  return supabase
    .from("reservations")
    .insert({
      guest_name: input.guestName,
      guest_phone: input.guestPhone ?? null,
      guest_email: input.guestEmail ?? null,
      party_size: input.partySize,
      reserved_at: input.reservedAt.toISOString(),
      notes: input.notes ?? null,
      staff_id: input.staffId ?? null,
      staff_name: input.staffName ?? null,
      source: input.source ?? "reservation",
      table_id: input.tableId ?? null,
      status,
      checked_in_at: status === "checked_in" ? nowIso() : null,
      updated_at: nowIso(),
    })
    .select("*, tables(label)")
    .single();
}

export async function updateReservationStatus(
  reservationId: string,
  status: ReservationStatus,
  extra?: { tableId?: string | null; checkedInAt?: Date; completedAt?: Date },
) {
  const payload: Record<string, unknown> = {
    status,
    updated_at: nowIso(),
  };

  if (extra?.tableId !== undefined) payload.table_id = extra.tableId;
  if (extra?.checkedInAt) payload.checked_in_at = extra.checkedInAt.toISOString();
  if (extra?.completedAt) payload.completed_at = extra.completedAt.toISOString();

  return supabase
    .from("reservations")
    .update(payload)
    .eq("id", reservationId)
    .select("*, tables(label)")
    .single();
}

export async function confirmReservation(reservationId: string) {
  return updateReservationStatus(reservationId, "confirmed");
}

export async function cancelReservation(reservationId: string) {
  return updateReservationStatus(reservationId, "cancelled");
}

export async function markReservationNoShow(reservationId: string) {
  return updateReservationStatus(reservationId, "no_show");
}

export async function checkInReservation(reservationId: string, tableId?: string) {
  return updateReservationStatus(reservationId, "checked_in", {
    tableId: tableId ?? null,
    checkedInAt: new Date(),
  });
}

export async function checkInReservationWithTable(reservationId: string, tableId: string) {
  const { data: table, error: tableFetchError } = await supabase
    .from("tables")
    .select("status")
    .eq("id", tableId)
    .single();

  if (tableFetchError) return { data: null, error: tableFetchError };
  if (table?.status !== "empty") {
    return { data: null, error: new Error("Table is not available") };
  }

  const occupiedAt = new Date().toISOString();
  const { error: tableError } = await supabase
    .from("tables")
    .update({
      status: "waiting",
      occupied_at: occupiedAt,
      orders: [],
    })
    .eq("id", tableId);

  if (tableError) return { data: null, error: tableError };

  return checkInReservation(reservationId, tableId);
}

const LATE_GRACE_MS = 30 * 60 * 1000;

export async function markLateReservations() {
  const now = Date.now();
  const lookback = new Date();
  lookback.setDate(lookback.getDate() - 1);

  const { data, error } = await supabase
    .from("reservations")
    .select("id, reserved_at, status")
    .in("status", ["pending", "confirmed"])
    .gte("reserved_at", lookback.toISOString());

  if (error) return { updated: 0, error };

  const overdueIds = (data ?? [])
    .filter((row) => now > new Date(row.reserved_at).getTime() + LATE_GRACE_MS)
    .map((row) => row.id);

  if (overdueIds.length === 0) return { updated: 0, error: null };

  const { error: updateError } = await supabase
    .from("reservations")
    .update({ status: "late", updated_at: nowIso() })
    .in("id", overdueIds);

  return { updated: overdueIds.length, error: updateError };
}

export async function createOnlineReservation(input: {
  guestName: string;
  email?: string;
  phone: string;
  guestCount: number;
  date: string;
  time: string;
  notes?: string;
}) {
  const reservedAt = new Date(`${input.date}T${input.time}:00`);

  return createReservation({
    guestName: input.guestName.trim(),
    guestPhone: input.phone.trim(),
    guestEmail: input.email?.trim() || undefined,
    partySize: Math.max(1, Math.min(20, input.guestCount)),
    reservedAt,
    notes: input.notes?.trim() || undefined,
    source: "reservation",
    status: "pending",
  });
}

export async function assignReservationTable(reservationId: string, tableId: string) {
  const { data: existing } = await supabase
    .from("reservations")
    .select("status")
    .eq("id", reservationId)
    .single();

  const status = (existing?.status as ReservationStatus | undefined) ?? "checked_in";
  const nextStatus: ReservationStatus =
    status === "confirmed" ? "checked_in" : status;

  return updateReservationStatus(reservationId, nextStatus, {
    tableId,
    checkedInAt: nextStatus === "checked_in" ? new Date() : undefined,
  });
}

export async function findActiveReservationForTable(tableId: string) {
  return supabase
    .from("reservations")
    .select("*, tables(label)")
    .eq("table_id", tableId)
    .eq("status", "checked_in")
    .order("checked_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

export async function completeReservationForTable(tableId: string) {
  const { data } = await findActiveReservationForTable(tableId);
  if (!data) return { data: null, error: null };

  return updateReservationStatus(data.id, "completed", {
    completedAt: new Date(),
  });
}

export async function createWalkIn(input: {
  partySize: number;
  tableId: string;
  guestName?: string;
  staffId?: string;
  staffName?: string;
}) {
  return createReservation({
    guestName: input.guestName?.trim() || "Walk-in",
    partySize: input.partySize,
    reservedAt: new Date(),
    source: "walk_in",
    tableId: input.tableId,
    status: "checked_in",
    staffId: input.staffId,
    staffName: input.staffName,
  });
}

interface ReservationChangeHandlers {
  onChange?: () => void;
  onInsert?: (reservation: ReservationRecord) => void;
}

export function subscribeToReservationChanges(handlers: ReservationChangeHandlers | (() => void)) {
  const normalized: ReservationChangeHandlers =
    typeof handlers === "function" ? { onChange: handlers } : handlers;

  const channel = supabase
    .channel("reservations-realtime")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "reservations" },
      (payload) => {
        normalized.onInsert?.(
          mapReservationRow(payload.new as Parameters<typeof mapReservationRow>[0]),
        );
        normalized.onChange?.();
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "reservations" },
      () => normalized.onChange?.(),
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "reservations" },
      () => normalized.onChange?.(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function mapReservationRow(
  row: {
    id: string;
    table_id: string | null;
    guest_name: string;
    guest_phone: string | null;
    guest_email: string | null;
    party_size: number;
    reserved_at: string;
    status: ReservationStatus;
    source: VisitSource;
    notes: string | null;
    staff_id: string | null;
    staff_name: string | null;
    checked_in_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
    tables?: { label: string } | { label: string }[] | null;
  },
): ReservationRecord {
  const tableJoin = row.tables;
  const tableLabel = Array.isArray(tableJoin) ? tableJoin[0]?.label : tableJoin?.label;

  return {
    id: row.id,
    tableId: row.table_id ?? undefined,
    tableLabel,
    guestName: row.guest_name,
    guestPhone: row.guest_phone ?? undefined,
    guestEmail: row.guest_email ?? undefined,
    partySize: row.party_size,
    reservedAt: new Date(row.reserved_at),
    status: row.status,
    source: row.source,
    notes: row.notes ?? undefined,
    staffId: row.staff_id ?? undefined,
    staffName: row.staff_name ?? undefined,
    checkedInAt: row.checked_in_at ? new Date(row.checked_in_at) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function mapReservationsResponse(
  data: Parameters<typeof mapReservationRow>[0][] | null,
): ReservationRecord[] {
  return (data ?? []).map(mapReservationRow);
}
