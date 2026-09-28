import type {
  ReservationRecord,
  ReservationStatus,
  TableStatus,
  VisitSource,
} from "@/lib/types";
import type { ReservationSnapshot, TableSnapshot } from "@/lib/reservation-undo";
import { generateBookingCode, generateManageToken } from "@/lib/reservation-codes";
import {
  buildTimeSlotsForDate,
  getWeekdayKeyForDateIso,
  type SlotCapacityRow,
  countGuestsInSlot,
} from "@/lib/reservation-slots";
import { shouldAlertOnReservationInsert } from "@/lib/reservation-change-alert";
import { normalizeReservationTableIds } from "@/lib/reservation-tables";
import { venueDayRangeUtc, venueWallTimeToUtc } from "@/lib/venue-timezone";
import { notifyReservationPushEvent } from "@/lib/web-push-client";
import { fetchAppSettings } from "@/src/lib/settings-actions";
import { supabase } from "@/src/lib/supabase";
import {
  GUEST_RESERVATION_ALERT_CHANNEL,
  GUEST_RESERVATION_ALERT_EVENT,
  type GuestReservationAlertPayload,
} from "@/lib/reservation-guest-alert";

/** Explicit FK hints — reservations has two FKs to tables. */
const RESERVATION_SELECT =
  "*, tables!table_id(label), secondary_table:tables!secondary_table_id(label)";

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

export interface UpdateReservationInput {
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  partySize: number;
  reservedAt: Date;
  notes?: string;
  tableId?: string | null;
  secondaryTableId?: string | null;
  eventType?: string | null;
}

const STAFF_EDITABLE_STATUSES: ReservationStatus[] = [
  "pending",
  "confirmed",
  "late",
  "checked_in",
];

function nowIso() {
  return new Date().toISOString();
}

export async function fetchReservations(since?: Date) {
  let query = supabase
    .from("reservations")
    .select(RESERVATION_SELECT)
    .order("reserved_at", { ascending: true })
    .limit(5000);

  if (since) {
    query = query.gte("reserved_at", since.toISOString());
  }

  return query;
}

export async function createReservation(input: CreateReservationInput) {
  const status = input.status ?? (input.source === "walk_in" ? "checked_in" : "pending");
  const source = input.source ?? "reservation";
  const withGuestCodes = source === "reservation" || source === "online" || source === "phone_call";

  const result = await supabase
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
      source,
      table_id: input.tableId ?? null,
      status,
      checked_in_at: status === "checked_in" ? nowIso() : null,
      booking_code: withGuestCodes ? generateBookingCode() : null,
      manage_token: withGuestCodes ? generateManageToken() : null,
      updated_at: nowIso(),
    })
    .select(RESERVATION_SELECT)
    .single();

  if (result.data) {
    const row = mapReservationRow(result.data as Parameters<typeof mapReservationRow>[0]);
    if (shouldAlertOnReservationInsert(row)) {
      notifyReservationPushEvent({
        kind: "new",
        reservationId: row.id,
        guestName: row.guestName,
        partySize: row.partySize,
        reservedAt: row.reservedAt,
        bookingCode: row.bookingCode,
      });
    }
  }

  return result;
}

export async function updateReservationStatus(
  reservationId: string,
  status: ReservationStatus,
  extra?: {
    tableId?: string | null;
    secondaryTableId?: string | null;
    checkedInAt?: Date;
    completedAt?: Date;
  },
) {
  const payload: Record<string, unknown> = {
    status,
    updated_at: nowIso(),
  };

  if (extra?.tableId !== undefined) payload.table_id = extra.tableId;
  if (extra?.secondaryTableId !== undefined) payload.secondary_table_id = extra.secondaryTableId;
  if (extra?.checkedInAt) payload.checked_in_at = extra.checkedInAt.toISOString();
  if (extra?.completedAt) payload.completed_at = extra.completedAt.toISOString();

  const result = await supabase
    .from("reservations")
    .update(payload)
    .eq("id", reservationId)
    .select(RESERVATION_SELECT)
    .single();

  if (result.data) {
    const row = mapReservationRow(result.data as Parameters<typeof mapReservationRow>[0]);
    if (status === "cancelled") {
      notifyReservationPushEvent({
        kind: "cancelled",
        reservationId: row.id,
        guestName: row.guestName,
        partySize: row.partySize,
        reservedAt: row.reservedAt,
        bookingCode: row.bookingCode,
      });
    } else if (status === "no_show") {
      notifyReservationPushEvent({
        kind: "no_show",
        reservationId: row.id,
        guestName: row.guestName,
        partySize: row.partySize,
        reservedAt: row.reservedAt,
        bookingCode: row.bookingCode,
      });
    }
    // pending → confirmed: no second staff push (already notified on "New reservation").
  }

  return result;
}

export async function confirmReservation(reservationId: string) {
  return updateReservationStatus(reservationId, "confirmed");
}

export async function cancelReservation(reservationId: string) {
  return updateReservationStatus(reservationId, "cancelled");
}

export async function updateReservationDetails(
  reservationId: string,
  input: UpdateReservationInput,
) {
  const { data: existing, error: fetchError } = await supabase
    .from("reservations")
    .select("id, status")
    .eq("id", reservationId)
    .single();

  if (fetchError || !existing) {
    return { data: null, error: fetchError ?? new Error("Reservation not found.") };
  }

  const status = existing.status as ReservationStatus;
  if (!STAFF_EDITABLE_STATUSES.includes(status)) {
    return {
      data: null,
      error: new Error("This reservation can no longer be edited."),
    };
  }

  const guestName = input.guestName.trim();
  if (!guestName) {
    return { data: null, error: new Error("Guest name is required.") };
  }

  const nextStatus: ReservationStatus = status === "late" ? "confirmed" : status;

  const payload: Record<string, unknown> = {
    guest_name: guestName,
    guest_phone: input.guestPhone?.trim() || null,
    guest_email: input.guestEmail?.trim() || null,
    party_size: Math.max(1, input.partySize),
    reserved_at: input.reservedAt.toISOString(),
    notes: input.notes?.trim() || null,
    event_type: input.eventType?.trim() || null,
    status: nextStatus,
    updated_at: nowIso(),
  };

  if (input.tableId !== undefined && status !== "checked_in") {
    const ids = normalizeReservationTableIds([input.tableId, input.secondaryTableId]);
    payload.table_id = ids[0] ?? null;
    payload.secondary_table_id = ids[1] ?? null;
  }

  const result = await supabase
    .from("reservations")
    .update(payload)
    .eq("id", reservationId)
    .select(RESERVATION_SELECT)
    .single();

  if (result.data) {
    const row = mapReservationRow(result.data as Parameters<typeof mapReservationRow>[0]);
    notifyReservationPushEvent({
      kind: "updated",
      reservationId: row.id,
      guestName: row.guestName,
      partySize: row.partySize,
      reservedAt: row.reservedAt,
      bookingCode: row.bookingCode,
    });
  }

  return result;
}

export async function markReservationNoShow(reservationId: string) {
  return updateReservationStatus(reservationId, "no_show");
}

export async function checkInReservation(
  reservationId: string,
  tableId?: string,
  secondaryTableId?: string | null,
) {
  const ids = normalizeReservationTableIds([tableId, secondaryTableId]);
  return updateReservationStatus(reservationId, "checked_in", {
    tableId: ids[0] ?? null,
    secondaryTableId: ids[1] ?? null,
    checkedInAt: new Date(),
  });
}

export async function fetchReservationSnapshot(
  reservationId: string,
): Promise<ReservationSnapshot | null> {
  const { data, error } = await supabase
    .from("reservations")
    .select("id, status, table_id, secondary_table_id, checked_in_at, completed_at")
    .eq("id", reservationId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    status: data.status as ReservationStatus,
    tableId: data.table_id ?? null,
    secondaryTableId: data.secondary_table_id ?? null,
    checkedInAt: data.checked_in_at ?? null,
    completedAt: data.completed_at ?? null,
  };
}

export async function fetchTableSnapshot(tableId: string): Promise<TableSnapshot | null> {
  const { data, error } = await supabase
    .from("tables")
    .select("id, status, occupied_at")
    .eq("id", tableId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    status: data.status as TableStatus,
    occupiedAt: data.occupied_at ?? null,
  };
}

export async function restoreReservationSnapshot(snapshot: ReservationSnapshot) {
  return supabase
    .from("reservations")
    .update({
      status: snapshot.status,
      table_id: snapshot.tableId,
      secondary_table_id: snapshot.secondaryTableId,
      checked_in_at: snapshot.checkedInAt,
      completed_at: snapshot.completedAt,
      updated_at: nowIso(),
    })
    .eq("id", snapshot.id)
    .select(RESERVATION_SELECT)
    .single();
}

export async function restoreTableSnapshot(snapshot: TableSnapshot) {
  const payload: Record<string, unknown> = {
    status: snapshot.status,
    occupied_at: snapshot.occupiedAt,
    updated_at: nowIso(),
  };

  if (snapshot.status === "empty") {
    payload.orders = null;
    payload.payment_status = "unpaid";
    payload.fulfillment_status = "in_progress";
  }

  return supabase.from("tables").update(payload).eq("id", snapshot.id);
}

async function ensureTableOccupiedForCheckIn(
  tableId: string,
  options?: { allowOccupied?: boolean },
): Promise<{ error: Error | null }> {
  const { data: table, error: tableFetchError } = await supabase
    .from("tables")
    .select("status")
    .eq("id", tableId)
    .single();

  if (tableFetchError) {
    return { error: tableFetchError instanceof Error ? tableFetchError : new Error(String(tableFetchError)) };
  }

  const isEmpty = table?.status === "empty";
  if (!isEmpty && !options?.allowOccupied) {
    return { error: new Error("Table is not available") };
  }

  if (isEmpty) {
    const occupiedAt = new Date().toISOString();
    const { error: tableError } = await supabase
      .from("tables")
      .update({
        status: "waiting",
        occupied_at: occupiedAt,
        orders: [],
      })
      .eq("id", tableId);

    if (tableError) {
      return { error: tableError instanceof Error ? tableError : new Error(String(tableError)) };
    }
  }

  return { error: null };
}

/** Check in a reservation onto 1–2 tables (occupies empty tables). */
export async function checkInReservationWithTables(
  reservationId: string,
  tableIds: string[],
  options?: { allowOccupied?: boolean },
) {
  const ids = normalizeReservationTableIds(tableIds);
  if (ids.length === 0) {
    return { data: null, error: new Error("Select a table") };
  }

  for (const tableId of ids) {
    const { error } = await ensureTableOccupiedForCheckIn(tableId, options);
    if (error) return { data: null, error };
  }

  return checkInReservation(reservationId, ids[0], ids[1] ?? null);
}

export async function checkInReservationWithTable(
  reservationId: string,
  tableId: string,
  options?: { allowOccupied?: boolean },
) {
  return checkInReservationWithTables(reservationId, [tableId], options);
}

const DEFAULT_LATE_GRACE_MINUTES = 30;

export async function fetchReservationsForDate(dateIso: string) {
  const { startIso, endExclusiveIso } = venueDayRangeUtc(dateIso);

  return supabase
    .from("reservations")
    .select("party_size, reserved_at, status")
    .gte("reserved_at", startIso)
    .lt("reserved_at", endExclusiveIso);
}

export async function markLateReservations(holdingMinutes = DEFAULT_LATE_GRACE_MINUTES) {
  const now = Date.now();
  const lookback = new Date();
  lookback.setDate(lookback.getDate() - 1);
  const graceMs = holdingMinutes * 60 * 1000;

  const { data, error } = await supabase
    .from("reservations")
    .select("id, reserved_at, status")
    .in("status", ["pending", "confirmed"])
    .gte("reserved_at", lookback.toISOString());

  if (error) return { updated: 0, error };

  const overdueIds = (data ?? [])
    .filter((row) => now > new Date(row.reserved_at).getTime() + graceMs)
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
  const { data: settings } = await fetchAppSettings();
  const reservedAt = venueWallTimeToUtc(input.date, input.time);
  const dayKey = getWeekdayKeyForDateIso(input.date);
  const dayConfig = settings.reservationOperatingHours[dayKey];

  if (!dayConfig.enabled) {
    return { data: null, error: new Error("Reservations are not accepted on this day.") };
  }

  const slots = buildTimeSlotsForDate(
    input.date,
    settings.reservationOperatingHours,
    settings.reservationTimeStep,
  );
  if (!slots.includes(input.time)) {
    return { data: null, error: new Error("Selected time is outside booking hours.") };
  }

  const guestCount = Math.max(1, Math.min(settings.reservationMaxGuestsPerSlot, input.guestCount));

  const { data: existingRows, error: fetchError } = await fetchReservationsForDate(input.date);
  if (fetchError) return { data: null, error: fetchError };

  const capacityRows: SlotCapacityRow[] = (existingRows ?? []).map((row) => ({
    partySize: row.party_size,
    reservedAt: row.reserved_at,
    status: row.status,
  }));

  const booked = countGuestsInSlot(
    capacityRows,
    input.date,
    input.time,
    settings.reservationTimeStep,
  );
  if (booked + guestCount > settings.reservationMaxGuestsPerSlot) {
    return { data: null, error: new Error("This time slot is fully booked. Please choose another time.") };
  }

  return createReservation({
    guestName: input.guestName.trim(),
    guestPhone: input.phone.trim(),
    guestEmail: input.email?.trim() || undefined,
    partySize: guestCount,
    reservedAt,
    notes: input.notes?.trim() || undefined,
    source: "online",
    status: "pending",
  });
}

/** Assign 1–2 planned tables (preview only — does not check in). */
export async function assignReservationTables(
  reservationId: string,
  tableIds: string[],
  options?: { allowOccupied?: boolean },
) {
  const ids = normalizeReservationTableIds(tableIds);
  if (ids.length === 0) {
    return { data: null, error: new Error("Select a table") };
  }

  for (const tableId of ids) {
    const { data: table, error: tableFetchError } = await supabase
      .from("tables")
      .select("status")
      .eq("id", tableId)
      .single();

    if (tableFetchError) return { data: null, error: tableFetchError };

    if (table?.status !== "empty" && !options?.allowOccupied) {
      return { data: null, error: new Error("Table is not available") };
    }
  }

  return supabase
    .from("reservations")
    .update({
      table_id: ids[0] ?? null,
      secondary_table_id: ids[1] ?? null,
      updated_at: nowIso(),
    })
    .eq("id", reservationId)
    .select(RESERVATION_SELECT)
    .single();
}

export async function assignReservationTable(
  reservationId: string,
  tableId: string,
  options?: { allowOccupied?: boolean },
) {
  return assignReservationTables(reservationId, [tableId], options);
}

export async function findActiveReservationForTable(tableId: string) {
  return supabase
    .from("reservations")
    .select(RESERVATION_SELECT)
    .eq("status", "checked_in")
    .or(`table_id.eq.${tableId},secondary_table_id.eq.${tableId}`)
    .order("checked_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

/**
 * When one linked table checks out: unlink it from the reservation.
 * Complete the reservation only when no linked tables remain.
 */
export async function completeReservationForTable(tableId: string, reservationId?: string | null) {
  const found = reservationId
    ? await supabase
        .from("reservations")
        .select("id, status, table_id, secondary_table_id")
        .eq("id", reservationId)
        .maybeSingle()
    : await findActiveReservationForTable(tableId);

  const row = found.data as
    | {
        id: string;
        status: string;
        table_id: string | null;
        secondary_table_id: string | null;
      }
    | null
    | undefined;

  if (!row || row.status !== "checked_in") return { data: null, error: found.error ?? null };

  let primary = row.table_id;
  let secondary = row.secondary_table_id;

  if (primary === tableId) {
    primary = secondary;
    secondary = null;
  } else if (secondary === tableId) {
    secondary = null;
  } else {
    // Reservation not linked to this table id — leave as-is.
    return { data: null, error: null };
  }

  if (!primary) {
    return updateReservationStatus(row.id, "completed", {
      completedAt: new Date(),
      tableId: null,
      secondaryTableId: null,
    });
  }

  return supabase
    .from("reservations")
    .update({
      table_id: primary,
      secondary_table_id: secondary,
      updated_at: nowIso(),
    })
    .eq("id", row.id)
    .select(RESERVATION_SELECT)
    .single();
}

interface ReservationChangeHandlers {
  onChange?: () => void;
  onInsert?: (reservation: ReservationRecord) => void;
  onUpdate?: (reservation: ReservationRecord) => void;
  onDelete?: (reservationId: string) => void;
}

export function subscribeToReservationChanges(handlers: ReservationChangeHandlers | (() => void)) {
  const normalized: ReservationChangeHandlers =
    typeof handlers === "function" ? { onChange: handlers } : handlers;

  const channelName = `reservations-realtime-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const channel = supabase
    .channel(channelName)
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
      (payload) => {
        if (payload.new) {
          normalized.onUpdate?.(
            mapReservationRow(payload.new as Parameters<typeof mapReservationRow>[0]),
          );
        }
        normalized.onChange?.();
      },
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "reservations" },
      (payload) => {
        const id = (payload.old as { id?: string } | null)?.id;
        if (id) normalized.onDelete?.(id);
        normalized.onChange?.();
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeToGuestReservationAlerts(
  onAlert: (payload: GuestReservationAlertPayload) => void,
) {
  const channel = supabase
    .channel(GUEST_RESERVATION_ALERT_CHANNEL)
    .on("broadcast", { event: GUEST_RESERVATION_ALERT_EVENT }, (message) => {
      const payload = message.payload as GuestReservationAlertPayload | undefined;
      if (!payload?.kind || !payload.reservation?.id) return;
      onAlert(payload);
    })
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function mapReservationRow(
  row: {
    id: string;
    table_id: string | null;
    secondary_table_id?: string | null;
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
    booking_code?: string | null;
    manage_token?: string | null;
    event_type?: string | null;
    tables?: { label: string } | { label: string }[] | null;
    secondary_table?: { label: string } | { label: string }[] | null;
  },
): ReservationRecord {
  const tableJoin = row.tables;
  const tableLabel = Array.isArray(tableJoin) ? tableJoin[0]?.label : tableJoin?.label;
  const secondaryJoin = row.secondary_table;
  const secondaryTableLabel = Array.isArray(secondaryJoin)
    ? secondaryJoin[0]?.label
    : secondaryJoin?.label;

  return {
    id: row.id,
    tableId: row.table_id ?? undefined,
    tableLabel,
    secondaryTableId: row.secondary_table_id ?? undefined,
    secondaryTableLabel,
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
    bookingCode: row.booking_code ?? undefined,
    eventType: row.event_type ?? undefined,
  };
}

export function mapReservationsResponse(
  data: Parameters<typeof mapReservationRow>[0][] | null,
): ReservationRecord[] {
  return (data ?? []).map(mapReservationRow);
}
