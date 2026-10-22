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
import { normalizeReservationTableIds, reservationTableIdColumns } from "@/lib/reservation-tables";
import { venueDayRangeUtc, venueWallTimeToUtc } from "@/lib/venue-timezone";
import { notifyReservationPushEvent } from "@/lib/web-push-client";
import { fetchAppSettings } from "@/src/lib/settings-actions";
import { supabase } from "@/src/lib/supabase";
import {
  GUEST_RESERVATION_ALERT_CHANNEL,
  GUEST_RESERVATION_ALERT_EVENT,
  type GuestReservationAlertPayload,
} from "@/lib/reservation-guest-alert";

/** Explicit FK hints — reservations has three FKs to tables. */
const RESERVATION_SELECT =
  "*, tables!table_id(label), secondary_table:tables!secondary_table_id(label), tertiary_table:tables!tertiary_table_id(label)";

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
  eventType?: string;
  referralCode?: string;
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
  tertiaryTableId?: string | null;
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

async function validateReservationPlacement(input: { reservedAt: Date; partySize: number; tableId?: string | null; notes?: string; excludeReservationId?: string }) {
  try {
    const response = await fetch("/api/reservations/live-availability", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "validate", ...input, reservedAt: input.reservedAt.toISOString() }) });
    const result = await response.json();
    return response.ok ? null : Object.assign(new Error(result.error ?? "Table is not available."), {
      code: result.code, overrideAllowed: result.overrideAllowed === true,
    });
  } catch (error) { return error instanceof Error ? error : new Error("Could not verify table availability."); }
}

export async function createReservation(input: CreateReservationInput) {
  const status = input.status ?? (input.source === "walk_in" ? "checked_in" : "pending");
  const source = input.source ?? "reservation";
  const withGuestCodes = source === "reservation" || source === "online" || source === "phone_call";
  if (status === "checked_in" && !input.tableId) return { data: null, error: new Error("Select one available table for check-in.") };
  const availabilityError = await validateReservationPlacement(input);
  if (availabilityError) return { data: null, error: availabilityError };

  const result = await supabase
    .from("reservations")
    .insert({
      guest_name: input.guestName,
      guest_phone: input.guestPhone ?? null,
      guest_email: input.guestEmail ?? null,
      party_size: input.partySize,
      reserved_at: input.reservedAt.toISOString(),
      notes: input.notes ?? null,
      ...(input.eventType?.trim()?{event_type:input.eventType.trim()}:{}),
      ...(input.referralCode?.trim()?{referral_code:input.referralCode.trim().toUpperCase()}:{}),
      staff_id: input.staffId ?? null,
      staff_name: input.staffName ?? null,
      source,
      table_id: input.tableId ?? null,
      status: status === "checked_in" ? "pending" : status,
      checked_in_at: null,
      booking_code: withGuestCodes ? generateBookingCode() : null,
      manage_token: withGuestCodes ? generateManageToken() : null,
      updated_at: nowIso(),
    })
    .select(RESERVATION_SELECT)
    .single();

  if (result.data && status === "checked_in") {
    const seated = await checkInReservationWithTables(result.data.id, [input.tableId!], { actualPartySize: input.partySize });
    if (seated.error) await supabase.from("reservations").delete().eq("id", result.data.id).eq("status", "pending");
    return seated;
  }
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
    tertiaryTableId?: string | null;
    checkedInAt?: Date;
    completedAt?: Date;
    actualPartySize?: number | null;
  },
) {
  const payload: Record<string, unknown> = {
    status,
    updated_at: nowIso(),
  };

  if (extra?.tableId !== undefined) payload.table_id = extra.tableId;
  if (extra?.secondaryTableId !== undefined) payload.secondary_table_id = extra.secondaryTableId;
  if (extra?.tertiaryTableId !== undefined) payload.tertiary_table_id = extra.tertiaryTableId;
  if (extra?.checkedInAt) payload.checked_in_at = extra.checkedInAt.toISOString();
  if (extra?.completedAt) payload.completed_at = extra.completedAt.toISOString();
  if (extra?.actualPartySize !== undefined) {
    payload.actual_party_size =
      extra.actualPartySize != null && extra.actualPartySize > 0
        ? Math.floor(extra.actualPartySize)
        : null;
  }

  const result = await supabase
    .from("reservations")
    .update(payload)
    .eq("id", reservationId)
    .select(RESERVATION_SELECT)
    .single();

  // Backward compatible if actual_party_size column is missing.
  if (
    result.error &&
    extra?.actualPartySize !== undefined &&
    /column .* does not exist/i.test(result.error.message)
  ) {
    delete payload.actual_party_size;
    return supabase
      .from("reservations")
      .update(payload)
      .eq("id", reservationId)
      .select(RESERVATION_SELECT)
      .single();
  }

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

export async function cancelReservation(
  reservationId: string,
  options?: {
    cancelledBy?: string;
    cancellationReason?: string;
    cancellationNote?: string;
  },
) {
  const payload: Record<string, unknown> = {
    status: "cancelled",
    updated_at: nowIso(),
    cancelled_at: nowIso(),
  };
  if (options?.cancelledBy) payload.cancelled_by = options.cancelledBy;
  if (options?.cancellationReason) payload.cancellation_reason = options.cancellationReason;
  if (options?.cancellationNote !== undefined) {
    payload.cancellation_note = options.cancellationNote?.trim() || null;
  }

  const result = await supabase
    .from("reservations")
    .update(payload)
    .eq("id", reservationId)
    .select(RESERVATION_SELECT)
    .single();

  if (result.error) {
    // Columns may not exist until migration — fall back to status-only cancel.
    if (/column .* does not exist/i.test(result.error.message)) {
      return updateReservationStatus(reservationId, "cancelled");
    }
    return result;
  }

  if (result.data) {
    const row = mapReservationRow(result.data as Parameters<typeof mapReservationRow>[0]);
    notifyReservationPushEvent({
      kind: "cancelled",
      reservationId: row.id,
      guestName: row.guestName,
      partySize: row.partySize,
      reservedAt: row.reservedAt,
      bookingCode: row.bookingCode,
    });
  }

  return result;
}

export async function updateReservationDetails(
  reservationId: string,
  input: UpdateReservationInput,
) {
  const { data: existing, error: fetchError } = await supabase
    .from("reservations")
    .select("id, status, table_id")
    .eq("id", reservationId)
    .single();

  if (fetchError || !existing) {
    return { data: null, error: fetchError ?? new Error("Reservation not found.") };
  }

  const status = existing.status as ReservationStatus;
  if (status !== "checked_in") {
    const availabilityError = await validateReservationPlacement({ ...input,
      tableId: input.tableId === undefined ? existing.table_id : input.tableId, excludeReservationId: reservationId });
    if (availabilityError) return { data: null, error: availabilityError };
  }

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
    const cols = reservationTableIdColumns([input.tableId, input.secondaryTableId, input.tertiaryTableId]);
    payload.table_id = cols.tableId;
    payload.secondary_table_id = cols.secondaryTableId;
    payload.tertiary_table_id = cols.tertiaryTableId;
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
  options?: { actualPartySize?: number | null; tertiaryTableId?: string | null; override?: boolean; overrideReason?: string },
) {
  if (!tableId || secondaryTableId || options?.tertiaryTableId) return { data: null, error: new Error("Select exactly one available table.") };
  try {
    const response = await fetch("/api/reservations/live-availability", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "check-in", reservationId, tableId, actualPartySize: options?.actualPartySize ?? undefined,
        override: options?.override === true, reason: options?.overrideReason }) });
    const result = await response.json();
    if (!response.ok) return { data: null, error: Object.assign(new Error(result.error ?? "Table is not available."), {
      code: result.code, overrideAllowed: result.overrideAllowed === true,
    }) };
    return supabase.from("reservations").select(RESERVATION_SELECT).eq("id", reservationId).single();
  } catch (error) { return { data: null, error: error instanceof Error ? error : new Error("Check-in failed.") }; }
}

export async function fetchReservationSnapshot(
  reservationId: string,
): Promise<ReservationSnapshot | null> {
  const { data, error } = await supabase
    .from("reservations")
    .select("id, status, table_id, secondary_table_id, tertiary_table_id, checked_in_at, completed_at")
    .eq("id", reservationId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    status: data.status as ReservationStatus,
    tableId: data.table_id ?? null,
    secondaryTableId: data.secondary_table_id ?? null,
    tertiaryTableId: data.tertiary_table_id ?? null,
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
      tertiary_table_id: snapshot.tertiaryTableId,
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

/** Check in atomically onto one available table. */
export async function checkInReservationWithTables(
  reservationId: string,
  tableIds: string[],
  options?: { allowOccupied?: boolean; actualPartySize?: number | null; override?: boolean; overrideReason?: string },
) {
  const ids = normalizeReservationTableIds(tableIds);
  if (ids.length !== 1) return { data: null, error: new Error("Select exactly one available table.") };

  return checkInReservation(reservationId, ids[0], ids[1] ?? null, {
    actualPartySize: options?.actualPartySize,
    tertiaryTableId: ids[2] ?? null,
    override: options?.override, overrideReason: options?.overrideReason,
  });
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

/** Assign one planned table, or clear its assignment; server checks staff permissions. */
export async function assignReservationTables(
  reservationId: string,
  tableIds: string[],
  options?: { allowOccupied?: boolean; override?: boolean; overrideReason?: string },
) {
  const ids = normalizeReservationTableIds(tableIds);
  if (ids.length > 1) return { data: null, error: new Error("Select exactly one table.") };
  if (ids.length === 1 && options?.override) {
    try {
      const response = await fetch("/api/reservations/live-availability", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "assign-override",
          reservationId, tableId: ids[0], reason: options.overrideReason }) });
      const result = await response.json();
      if (!response.ok) return { data: null, error: new Error(result.error ?? "Could not override table assignment.") };
      return supabase.from("reservations").select(RESERVATION_SELECT).eq("id", reservationId).single();
    } catch (error) { return { data: null, error: error instanceof Error ? error : new Error("Could not override table assignment.") }; }
  }
  if (ids.length === 0) {
    try {
      const response = await fetch("/api/reservations/live-availability", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unassign", reservationId }) });
      const result = await response.json();
      if (!response.ok) return { data: null, error: new Error(result.error ?? "Could not remove table assignment.") };
      return supabase.from("reservations").select(RESERVATION_SELECT).eq("id", reservationId).single();
    } catch (error) { return { data: null, error: error instanceof Error ? error : new Error("Could not remove table assignment.") }; }
  }
  const { data: reservation, error } = await supabase.from("reservations")
    .select("status,reserved_at,party_size,notes").eq("id", reservationId).single();
  if (error || !reservation) return { data: null, error: error ?? new Error("Reservation not found.") };
  if (reservation.status === "checked_in") return { data: null, error: new Error("Use the floor map to move an occupied table.") };
  const availabilityError = await validateReservationPlacement({ reservedAt: new Date(reservation.reserved_at),
    partySize: reservation.party_size, notes: reservation.notes ?? undefined, tableId: ids[0], excludeReservationId: reservationId });
  if (availabilityError) return { data: null, error: availabilityError };
  const assigned = await supabase.from("reservations").update({ table_id: ids[0], secondary_table_id: null, tertiary_table_id: null,
    staff_override_capacity: false,
    updated_at: nowIso() }).eq("id", reservationId).in("status", ["pending", "confirmed", "late"]).select(RESERVATION_SELECT).single();
  if (assigned.error?.code === "P0001" && /Table is (occupied|already reserved|unavailable)/i.test(assigned.error.message)) {
    return { data: null, error: Object.assign(new Error(assigned.error.message), { code: "TABLE_ASSIGNMENT_CONFLICT", overrideAllowed: true }) };
  }
  return assigned;
}

export async function assignReservationTable(
  reservationId: string,
  tableId: string,
  options?: { allowOccupied?: boolean },
) {
  return assignReservationTables(reservationId, [tableId], options);
}

export async function findActiveReservationForTable(tableId: string) {
  // An override may add a booking to an occupied visit; keep the original
  // booking as the bill/referral owner instead of switching to the latest join.
  return supabase
    .from("reservations")
    .select(RESERVATION_SELECT)
    .eq("status", "checked_in")
    .or(
      `table_id.eq.${tableId},secondary_table_id.eq.${tableId},tertiary_table_id.eq.${tableId}`,
    )
    .order("checked_in_at", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
}

/**
 * Complete every checked-in booking sharing this table visit, retaining any
 * historical links to other tables. A future assigned booking is never changed.
 */
export async function completeReservationForTable(tableId: string, reservationId?: string | null) {
  const found = await supabase.from("reservations")
    .select("id, status, table_id, secondary_table_id, tertiary_table_id")
    .eq("status", "checked_in")
    .or(`table_id.eq.${tableId},secondary_table_id.eq.${tableId},tertiary_table_id.eq.${tableId}`);
  if (found.error) return { data: null, error: found.error };
  const rows = found.data ?? [];
  if (reservationId && !rows.some((row) => row.id === reservationId)) return { data: null, error: null };
  for (const row of rows) {
    const result = await completeReservationTableLink(tableId, row);
    if (result.error) return { data: null, error: result.error };
  }
  return { data: rows, error: null };
}

async function completeReservationTableLink(tableId: string, row: {
  id: string; table_id: string | null; secondary_table_id: string | null; tertiary_table_id: string | null;
}) {

  const remaining = normalizeReservationTableIds([
    row.table_id,
    row.secondary_table_id,
    row.tertiary_table_id,
  ]).filter((id) => id !== tableId);

  if (remaining.length === normalizeReservationTableIds([
    row.table_id,
    row.secondary_table_id,
    row.tertiary_table_id,
  ]).length) {
    // Reservation not linked to this table id — leave as-is.
    return { data: null, error: null };
  }

  if (remaining.length === 0) {
    return updateReservationStatus(row.id, "completed", {
      completedAt: new Date(),
      tableId: null,
      secondaryTableId: null,
      tertiaryTableId: null,
    });
  }

  const cols = reservationTableIdColumns(remaining);
  return supabase
    .from("reservations")
    .update({
      table_id: cols.tableId,
      secondary_table_id: cols.secondaryTableId,
      tertiary_table_id: cols.tertiaryTableId,
      updated_at: nowIso(),
    })
    .eq("id", row.id)
    .select(RESERVATION_SELECT)
    .single();
}

interface ReservationChangeHandlers {
  onConnectionChange?: (connected: boolean) => void;
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
    .subscribe((status) => normalized.onConnectionChange?.(status === "SUBSCRIBED"));

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
    referral_code_id?: string | null;
    referral_code?: string | null;
    id: string;
    table_id: string | null;
    secondary_table_id?: string | null;
    tertiary_table_id?: string | null;
    guest_name: string;
    guest_phone: string | null;
    guest_email: string | null;
    party_size: number;
    actual_party_size?: number | null;
    reserved_at: string;
    status: ReservationStatus;
    source: VisitSource;
    notes: string | null;
    wants_grill?: string | null;
    staff_id: string | null;
    staff_name: string | null;
    checked_in_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
    guest_submitted_at?: string | null;
    guest_changed_at?: string | null;
    booking_code?: string | null;
    manage_token?: string | null;
    event_type?: string | null;
    suggested_seating?: string | null;
    suggested_capacity?: number | null;
    capacity_status?: string | null;
    capacity_warnings?: string | null;
    staff_override_capacity?: boolean | null;
    cancelled_at?: string | null;
    cancelled_by?: string | null;
    cancellation_reason?: string | null;
    cancellation_note?: string | null;
    cancel_email_status?: string | null;
    confirm_email_status?: string | null;
    tables?: { label: string } | { label: string }[] | null;
    secondary_table?: { label: string } | { label: string }[] | null;
    tertiary_table?: { label: string } | { label: string }[] | null;
  },
): ReservationRecord {
  const tableJoin = row.tables;
  const tableLabel = Array.isArray(tableJoin) ? tableJoin[0]?.label : tableJoin?.label;
  const secondaryJoin = row.secondary_table;
  const secondaryTableLabel = Array.isArray(secondaryJoin)
    ? secondaryJoin[0]?.label
    : secondaryJoin?.label;
  const tertiaryJoin = row.tertiary_table;
  const tertiaryTableLabel = Array.isArray(tertiaryJoin)
    ? tertiaryJoin[0]?.label
    : tertiaryJoin?.label;

  const wantsGrill =
    row.wants_grill === "yes" || row.wants_grill === "no" || row.wants_grill === "undecided"
      ? row.wants_grill
      : undefined;
  const capacityStatus =
    row.capacity_status === "available" ||
    row.capacity_status === "limited" ||
    row.capacity_status === "full"
      ? row.capacity_status
      : undefined;

  return {
    id: row.id,
    tableId: row.table_id ?? undefined,
    tableLabel,
    secondaryTableId: row.secondary_table_id ?? undefined,
    secondaryTableLabel,
    tertiaryTableId: row.tertiary_table_id ?? undefined,
    tertiaryTableLabel,
    guestName: row.guest_name,
    guestPhone: row.guest_phone ?? undefined,
    guestEmail: row.guest_email ?? undefined,
    referralCodeId: row.referral_code_id ?? undefined,
    referralCode: row.referral_code ?? undefined,
    partySize: row.party_size,
    actualPartySize: row.actual_party_size ?? undefined,
    reservedAt: new Date(row.reserved_at),
    status: row.status,
    source: row.source,
    notes: row.notes ?? undefined,
    wantsGrill,
    staffId: row.staff_id ?? undefined,
    staffName: row.staff_name ?? undefined,
    checkedInAt: row.checked_in_at ? new Date(row.checked_in_at) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    guestSubmittedAt: row.guest_submitted_at ? new Date(row.guest_submitted_at) : undefined,
    guestChangedAt: row.guest_changed_at ? new Date(row.guest_changed_at) : undefined,
    bookingCode: row.booking_code ?? undefined,
    eventType: row.event_type ?? undefined,
    suggestedSeating: row.suggested_seating ?? undefined,
    suggestedCapacity: row.suggested_capacity ?? undefined,
    capacityStatus,
    capacityWarnings: row.capacity_warnings ?? undefined,
    staffOverrideCapacity: Boolean(row.staff_override_capacity),
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : undefined,
    cancelledBy: row.cancelled_by ?? undefined,
    cancellationReason: row.cancellation_reason ?? undefined,
    cancellationNote: row.cancellation_note ?? undefined,
    cancelEmailStatus: row.cancel_email_status ?? undefined,
    confirmEmailStatus: row.confirm_email_status ?? undefined,
  };
}

export function mapReservationsResponse(
  data: Parameters<typeof mapReservationRow>[0][] | null,
): ReservationRecord[] {
  return (data ?? []).map(mapReservationRow);
}
