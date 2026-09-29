import {
  buildTimeSlotsForDate,
  countGuestsInSlot,
  DEFAULT_RESERVATION_OPERATING_HOURS,
  getWeekdayKeyForDateIso,
  type SlotCapacityRow,
} from "@/lib/reservation-slots";
import {
  blockedTableLabels,
  clampReservationDurationMinutes,
  DEFAULT_RESERVATION_DURATION_MINUTES,
  evaluateReservationCapacity,
  evaluateSlotsForGuest,
  type CapacityEvaluateResult,
  type CapacityReservationInput,
  type GrillNeed,
  type OccupiedTableInput,
  type SlotAvailability,
} from "@/lib/reservation-capacity-engine";
import { ONLINE_SELF_SERVE_MAX_PARTY } from "@/lib/reservation-party-limits";
import { generateBookingCode, generateManageToken } from "@/lib/reservation-codes";
import {
  parseReservationEventTypes,
  parseReservationGuestTexts,
  parseReservationRequiredFields,
  type GuestReservationLang,
} from "@/lib/reservation-guest-form";
import { guestReservationCopy, parseGuestReservationLang } from "@/lib/i18n/guest-reservation";
import type { AppSettings, ReservationOperatingHours, ReservationStatus } from "@/lib/types";
import { venueDayRangeUtc, venueWallTimeToUtc } from "@/lib/venue-timezone";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";
import { sumActiveHoldsForSlot } from "@/src/lib/reservation-holds";

export interface OnlineBookInput {
  guestName: string;
  email: string;
  phone: string;
  guestCount: number;
  date: string;
  time: string;
  notes?: string;
  eventType?: string;
  gdprConsent?: boolean;
  lang?: GuestReservationLang;
  /** Client Screen / reception: allow empty email even if settings require it. */
  emailOptional?: boolean;
  /** Client Screen / reception: create as confirmed staff booking (check-in ready). */
  receptionDesk?: boolean;
  /** Short-lived capacity hold token from /api/reservations/hold. */
  holdToken?: string;
  wantsGrill?: "yes" | "no" | "undecided" | null;
  /** Staff POS may force-accept when engine says Full. Guests cannot. */
  staffOverrideCapacity?: boolean;
}

export interface GuestReservationPublic {
  id: string;
  bookingCode: string;
  manageToken: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  partySize: number;
  reservedAt: string;
  status: ReservationStatus;
  notes: string | null;
  eventType: string | null;
}

const MANAGEABLE_STATUSES: ReservationStatus[] = ["pending", "confirmed", "late"];

type ReservationGuestSettings = Pick<
  AppSettings,
  | "reservationTimeStep"
  | "reservationMaxGuestsPerSlot"
  | "reservationDurationMinutes"
  | "reservationOperatingHours"
  | "reservationRequiredFields"
  | "reservationEventTypes"
>;

const DEFAULT_RESERVATION_SETTINGS: ReservationGuestSettings = {
  reservationTimeStep: 30,
  reservationMaxGuestsPerSlot: 20,
  reservationDurationMinutes: DEFAULT_RESERVATION_DURATION_MINUTES,
  reservationOperatingHours: DEFAULT_RESERVATION_OPERATING_HOURS,
  reservationRequiredFields: parseReservationRequiredFields(null),
  reservationEventTypes: parseReservationEventTypes(null),
};

function parseOperatingHours(value: unknown): ReservationOperatingHours {
  if (!value || typeof value !== "object") return DEFAULT_RESERVATION_OPERATING_HOURS;
  return {
    ...DEFAULT_RESERVATION_OPERATING_HOURS,
    ...(value as ReservationOperatingHours),
  };
}

async function fetchReservationGuestSettings(): Promise<ReservationGuestSettings> {
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("settings")
      .select(
        "reservation_time_step, reservation_max_guests_per_slot, reservation_duration_minutes, reservation_operating_hours, reservation_required_fields, reservation_event_types",
      )
      .eq("id", 1)
      .maybeSingle();

    // Older DBs without reservation_duration_minutes — retry without that column.
    if (error && /reservation_duration_minutes/i.test(error.message)) {
      const legacy = await admin
        .from("settings")
        .select(
          "reservation_time_step, reservation_max_guests_per_slot, reservation_operating_hours, reservation_required_fields, reservation_event_types",
        )
        .eq("id", 1)
        .maybeSingle();
      if (!legacy.data) return DEFAULT_RESERVATION_SETTINGS;
      return {
        reservationTimeStep:
          legacy.data.reservation_time_step ?? DEFAULT_RESERVATION_SETTINGS.reservationTimeStep,
        reservationMaxGuestsPerSlot:
          legacy.data.reservation_max_guests_per_slot ??
          DEFAULT_RESERVATION_SETTINGS.reservationMaxGuestsPerSlot,
        reservationDurationMinutes: DEFAULT_RESERVATION_SETTINGS.reservationDurationMinutes,
        reservationOperatingHours: parseOperatingHours(legacy.data.reservation_operating_hours),
        reservationRequiredFields: parseReservationRequiredFields(
          legacy.data.reservation_required_fields,
        ),
        reservationEventTypes: parseReservationEventTypes(legacy.data.reservation_event_types),
      };
    }

    if (!data) return DEFAULT_RESERVATION_SETTINGS;

    return {
      reservationTimeStep:
        data.reservation_time_step ?? DEFAULT_RESERVATION_SETTINGS.reservationTimeStep,
      reservationMaxGuestsPerSlot:
        data.reservation_max_guests_per_slot ??
        DEFAULT_RESERVATION_SETTINGS.reservationMaxGuestsPerSlot,
      reservationDurationMinutes: clampReservationDurationMinutes(
        (data as { reservation_duration_minutes?: number | null }).reservation_duration_minutes ??
          DEFAULT_RESERVATION_SETTINGS.reservationDurationMinutes,
      ),
      reservationOperatingHours: parseOperatingHours(data.reservation_operating_hours),
      reservationRequiredFields: parseReservationRequiredFields(data.reservation_required_fields),
      reservationEventTypes: parseReservationEventTypes(data.reservation_event_types),
    };
  } catch {
    return DEFAULT_RESERVATION_SETTINGS;
  }
}

export function isGuestManageableStatus(status: ReservationStatus): boolean {
  return MANAGEABLE_STATUSES.includes(status);
}

function mapPublicRow(row: {
  id: string;
  booking_code: string | null;
  manage_token: string | null;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  party_size: number;
  reserved_at: string;
  status: ReservationStatus;
  notes: string | null;
  event_type?: string | null;
}): GuestReservationPublic | null {
  if (!row.booking_code || !row.manage_token) return null;
  return {
    id: row.id,
    bookingCode: row.booking_code,
    manageToken: row.manage_token,
    guestName: row.guest_name,
    guestEmail: row.guest_email,
    guestPhone: row.guest_phone,
    partySize: row.party_size,
    reservedAt: row.reserved_at,
    status: row.status,
    notes: row.notes,
    eventType: row.event_type ?? null,
  };
}

export async function ensureReservationCodes(reservationId: string): Promise<{
  bookingCode: string;
  manageToken: string;
  error: Error | null;
}> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("reservations")
    .select("booking_code, manage_token")
    .eq("id", reservationId)
    .single();

  if (error || !data) {
    return {
      bookingCode: "",
      manageToken: "",
      error: error ? new Error(error.message) : new Error("Reservation not found"),
    };
  }

  if (data.booking_code && data.manage_token) {
    return { bookingCode: data.booking_code, manageToken: data.manage_token, error: null };
  }

  const bookingCode = data.booking_code || generateBookingCode();
  const manageToken = data.manage_token || generateManageToken();
  const { error: updateError } = await admin
    .from("reservations")
    .update({
      booking_code: bookingCode,
      manage_token: manageToken,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reservationId);

  return {
    bookingCode,
    manageToken,
    error: updateError ? new Error(updateError.message) : null,
  };
}

type DayCapacityContext = {
  settings: ReservationGuestSettings;
  reservations: CapacityReservationInput[];
  occupiedTables: OccupiedTableInput[];
};

async function loadDayCapacityContext(dateIso: string): Promise<DayCapacityContext> {
  const settings = await fetchReservationGuestSettings();
  const admin = createSupabaseAdmin();
  const { startIso, endExclusiveIso } = venueDayRangeUtc(dateIso);

  let reservations: CapacityReservationInput[] = [];
  try {
    const { data: existingRows } = await admin
      .from("reservations")
      .select(
        "id, party_size, actual_party_size, reserved_at, status, notes, wants_grill, tables!table_id(label), secondary_table:tables!secondary_table_id(label)",
      )
      .gte("reserved_at", startIso)
      .lt("reserved_at", endExclusiveIso);

    type ExistingRow = {
      id: string;
      party_size: number;
      actual_party_size?: number | null;
      reserved_at: string;
      status: string;
      notes: string | null;
      wants_grill?: string | null;
      tables?: { label: string } | { label: string }[] | null;
      secondary_table?: { label: string } | { label: string }[] | null;
    };

    reservations = ((existingRows ?? []) as ExistingRow[]).map((row) => {
      const tableJoin = row.tables;
      const tableLabel = Array.isArray(tableJoin) ? tableJoin[0]?.label : tableJoin?.label;
      const secondaryJoin = row.secondary_table;
      const secondaryTableLabel = Array.isArray(secondaryJoin)
        ? secondaryJoin[0]?.label
        : secondaryJoin?.label;
      return {
        id: row.id,
        partySize: row.party_size,
        actualPartySize: row.actual_party_size,
        reservedAt: row.reserved_at,
        status: row.status,
        notes: row.notes,
        wantsGrill:
          row.wants_grill === "yes" || row.wants_grill === "no" || row.wants_grill === "undecided"
            ? row.wants_grill
            : undefined,
        tableLabel,
        secondaryTableLabel,
      };
    });
  } catch {
    const { data: legacyRows } = await admin
      .from("reservations")
      .select("id, party_size, reserved_at, status, notes")
      .gte("reserved_at", startIso)
      .lt("reserved_at", endExclusiveIso);
    reservations = (legacyRows ?? []).map((row) => ({
      id: row.id,
      partySize: row.party_size,
      reservedAt: row.reserved_at,
      status: row.status,
      notes: row.notes,
    }));
  }

  let occupiedTables: OccupiedTableInput[] = [];
  try {
    const { data: floorTables } = await admin
      .from("tables")
      .select("label, status, occupied_at")
      .neq("status", "empty");
    occupiedTables = (floorTables ?? []).map((row) => ({
      label: String(row.label),
      occupied: row.status === "waiting" || row.status === "ready",
      occupiedAt: (row as { occupied_at?: string | null }).occupied_at ?? null,
    }));
  } catch {
    occupiedTables = [];
  }

  return { settings, reservations, occupiedTables };
}

/** Guest-facing slot availability (Available / Limited / Full) — no table labels. */
export async function evaluateGuestSlotAvailability(input: {
  date: string;
  partySize: number;
  grill?: GrillNeed;
  times?: string[];
}): Promise<{
  slots: Array<{
    time: string;
    availability: CapacityEvaluateResult["availability"];
    guestStatus: CapacityEvaluateResult["guestStatus"];
  }>;
  settings: ReservationGuestSettings;
}> {
  const ctx = await loadDayCapacityContext(input.date);
  const times =
    input.times ??
    buildTimeSlotsForDate(
      input.date,
      ctx.settings.reservationOperatingHours,
      ctx.settings.reservationTimeStep,
    );

  const heldGuestsByTime: Record<string, number> = {};
  await Promise.all(
    times.map(async (time) => {
      heldGuestsByTime[time] = await sumActiveHoldsForSlot({
        dateIso: input.date,
        time,
      });
    }),
  );

  const evaluated = evaluateSlotsForGuest({
    dateIso: input.date,
    times,
    partySize: Math.max(1, input.partySize),
    grill: input.grill ?? null,
    reservations: ctx.reservations,
    occupiedTables: ctx.occupiedTables,
    maxGuestsPerSlot: ctx.settings.reservationMaxGuestsPerSlot,
    durationMinutes: ctx.settings.reservationDurationMinutes,
    heldGuestsByTime,
  });

  return {
    settings: ctx.settings,
    slots: evaluated.map(({ time, result }) => ({
      time,
      availability: result.availability,
      guestStatus: result.guestStatus,
    })),
  };
}

export type StaffCapacitySlotDetail = {
  time: string;
  availability: SlotAvailability;
  recommendationLabel: string | null;
  freeConfigurationCount: number;
  overlappingGuestCount: number;
  remainingSeatEstimate: number;
  heldGuests: number;
  warnings: string[];
  staffSummary: string;
  blockedLabels: string[];
};

export type StaffPartySizeSummary = {
  partySize: number;
  available: number;
  limited: number;
  full: number;
};

/** Staff-only day capacity — includes table labels, blocked sets, and seating counts. */
export async function evaluateStaffDayCapacity(input: {
  date: string;
  partySize: number;
  grill?: GrillNeed;
}): Promise<{
  date: string;
  partySize: number;
  grill: GrillNeed;
  maxGuestsPerSlot: number;
  slots: StaffCapacitySlotDetail[];
  summary: { available: number; limited: number; full: number; total: number };
  partySizeSummaries: StaffPartySizeSummary[];
}> {
  const partySize = Math.max(1, input.partySize);
  const grill: GrillNeed = input.grill ?? null;
  const ctx = await loadDayCapacityContext(input.date);
  const times = buildTimeSlotsForDate(
    input.date,
    ctx.settings.reservationOperatingHours,
    ctx.settings.reservationTimeStep,
  );

  const heldGuestsByTime: Record<string, number> = {};
  await Promise.all(
    times.map(async (time) => {
      heldGuestsByTime[time] = await sumActiveHoldsForSlot({
        dateIso: input.date,
        time,
      });
    }),
  );

  const durationMinutes = ctx.settings.reservationDurationMinutes;

  const evaluated = evaluateSlotsForGuest({
    dateIso: input.date,
    times,
    partySize,
    grill,
    reservations: ctx.reservations,
    occupiedTables: ctx.occupiedTables,
    maxGuestsPerSlot: ctx.settings.reservationMaxGuestsPerSlot,
    durationMinutes,
    heldGuestsByTime,
  });

  const slots: StaffCapacitySlotDetail[] = evaluated.map(({ time, result }) => {
    const blocked = blockedTableLabels({
      reservations: ctx.reservations,
      occupiedTables: ctx.occupiedTables,
      dateIso: input.date,
      time,
      durationMinutes,
    });
    return {
      time,
      availability: result.availability,
      recommendationLabel: result.recommendationLabel,
      freeConfigurationCount: result.freeConfigurationCount,
      overlappingGuestCount: result.overlappingGuestCount,
      remainingSeatEstimate: result.remainingSeatEstimate,
      heldGuests: heldGuestsByTime[time] ?? 0,
      warnings: result.warnings,
      staffSummary: result.staffSummary,
      blockedLabels: [...blocked].sort((a, b) => a.localeCompare(b)),
    };
  });

  const summary = {
    total: slots.length,
    available: slots.filter((row) => row.availability === "available").length,
    limited: slots.filter((row) => row.availability === "limited").length,
    full: slots.filter((row) => row.availability === "full").length,
  };

  const referenceSizes = [2, 4, 6, 8, 10, 12].filter(
    (size) => size <= ONLINE_SELF_SERVE_MAX_PARTY || size === partySize,
  );
  const uniqueSizes = [...new Set([partySize, ...referenceSizes])].sort((a, b) => a - b);

  const partySizeSummaries: StaffPartySizeSummary[] = uniqueSizes.map((size) => {
    const rows = evaluateSlotsForGuest({
      dateIso: input.date,
      times,
      partySize: size,
      grill,
      reservations: ctx.reservations,
      occupiedTables: ctx.occupiedTables,
      maxGuestsPerSlot: ctx.settings.reservationMaxGuestsPerSlot,
      durationMinutes,
      heldGuestsByTime,
    });
    return {
      partySize: size,
      available: rows.filter((row) => row.result.availability === "available").length,
      limited: rows.filter((row) => row.result.availability === "limited").length,
      full: rows.filter((row) => row.result.availability === "full").length,
    };
  });

  return {
    date: input.date,
    partySize,
    grill,
    maxGuestsPerSlot: ctx.settings.reservationMaxGuestsPerSlot,
    slots,
    summary,
    partySizeSummaries,
  };
}

export async function patchReservationEmailStatus(
  reservationId: string,
  fields: {
    cancelEmailStatus?: string;
    cancelEmailError?: string | null;
    confirmEmailStatus?: string;
  },
): Promise<void> {
  try {
    const admin = createSupabaseAdmin();
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (fields.cancelEmailStatus !== undefined) {
      payload.cancel_email_status = fields.cancelEmailStatus;
    }
    if (fields.cancelEmailError !== undefined) {
      payload.cancel_email_error = fields.cancelEmailError;
    }
    if (fields.confirmEmailStatus !== undefined) {
      payload.confirm_email_status = fields.confirmEmailStatus;
    }
    await admin.from("reservations").update(payload).eq("id", reservationId);
  } catch {
    /* columns may not exist yet */
  }
}

async function validateSlotCapacity(params: {
  settings: ReservationGuestSettings;
  date: string;
  time: string;
  guestCount: number;
  excludeReservationId?: string;
}): Promise<{ ok: true; guestCount: number } | { ok: false; error: string }> {
  const { settings, date, time, excludeReservationId } = params;
  const reservedAt = venueWallTimeToUtc(date, time);
  const dayKey = getWeekdayKeyForDateIso(date);
  const dayConfig = settings.reservationOperatingHours[dayKey];

  if (!dayConfig.enabled) {
    return { ok: false, error: "Reservations are not accepted on this day." };
  }

  const slots = buildTimeSlotsForDate(
    date,
    settings.reservationOperatingHours,
    settings.reservationTimeStep,
  );
  if (!slots.includes(time)) {
    return { ok: false, error: "Selected time is outside booking hours." };
  }

  const guestCount = Math.max(
    1,
    Math.min(settings.reservationMaxGuestsPerSlot, params.guestCount),
  );

  const { startIso, endExclusiveIso } = venueDayRangeUtc(date);
  const admin = createSupabaseAdmin();
  const { data: existingRows, error: fetchError } = await admin
    .from("reservations")
    .select("id, party_size, reserved_at, status")
    .gte("reserved_at", startIso)
    .lt("reserved_at", endExclusiveIso);

  if (fetchError) return { ok: false, error: fetchError.message };

  const capacityRows: SlotCapacityRow[] = (existingRows ?? [])
    .filter((row) => row.id !== excludeReservationId)
    .map((row) => ({
      partySize: row.party_size,
      reservedAt: row.reserved_at,
      status: row.status,
    }));

  const booked = countGuestsInSlot(
    capacityRows,
    date,
    time,
    settings.reservationTimeStep,
  );
  if (booked + guestCount > settings.reservationMaxGuestsPerSlot) {
    return {
      ok: false,
      error: "This time slot is fully booked. Please choose another time.",
    };
  }

  return { ok: true, guestCount };
}

function validateGuestInput(
  input: OnlineBookInput,
  settings: ReservationGuestSettings,
): string | null {
  const lang = parseGuestReservationLang(input.lang);
  const copy = guestReservationCopy(lang);
  const required = settings.reservationRequiredFields;
  const guestName = input.guestName.trim();
  const email = input.email.trim();
  const phone = input.phone.trim();
  const eventType = input.eventType?.trim() ?? "";

  if (required.name && !guestName) return copy.errorName;
  if (required.email && !email && !input.emailOptional) return copy.errorEmail;
  if (required.phone && !phone) return copy.errorPhone;
  if ((required.date || required.time) && (!input.date || !input.time)) {
    return copy.errorDateTime;
  }
  if (
    required.eventType &&
    settings.reservationEventTypes.length > 0 &&
    !eventType
  ) {
    return copy.errorEventType;
  }
  if (eventType) {
    const allowed = settings.reservationEventTypes.some((row) => row.id === eventType);
    if (!allowed) return copy.errorEventType;
  }
  if (!input.gdprConsent) return copy.errorGdpr;
  return null;
}

export async function createOnlineReservationServer(input: OnlineBookInput): Promise<{
  data: GuestReservationPublic | null;
  error: string | null;
}> {
  const settings = await fetchReservationGuestSettings();
  const validationError = validateGuestInput(input, settings);
  if (validationError) return { data: null, error: validationError };

  if (!input.date || !input.time) {
    const copy = guestReservationCopy(parseGuestReservationLang(input.lang));
    return { data: null, error: copy.errorDateTime };
  }

  if (
    !input.receptionDesk &&
    input.guestCount > ONLINE_SELF_SERVE_MAX_PARTY
  ) {
    const copy = guestReservationCopy(parseGuestReservationLang(input.lang));
    return { data: null, error: copy.largePartyMessage };
  }

  const guestCount = Math.max(
    1,
    Math.min(settings.reservationMaxGuestsPerSlot, input.guestCount),
  );

  const ctx = await loadDayCapacityContext(input.date);
  const heldGuests = await sumActiveHoldsForSlot({
    dateIso: input.date,
    time: input.time,
    excludeToken: input.holdToken,
  });

  const evaluation = evaluateReservationCapacity({
    dateIso: input.date,
    time: input.time,
    partySize: guestCount,
    grill: input.wantsGrill ?? null,
    reservations: ctx.reservations,
    occupiedTables: ctx.occupiedTables,
    maxGuestsPerSlot: ctx.settings.reservationMaxGuestsPerSlot,
    durationMinutes: ctx.settings.reservationDurationMinutes,
    heldGuests,
  });

  const allowFull =
    input.staffOverrideCapacity === true || input.receptionDesk === true;
  if (evaluation.availability === "full" && !allowFull) {
    return {
      data: null,
      error: "This time slot is fully booked. Please choose another time.",
    };
  }

  // Also enforce operating hours via legacy slot list.
  const dayKey = getWeekdayKeyForDateIso(input.date);
  const dayConfig = settings.reservationOperatingHours[dayKey];
  if (!dayConfig?.enabled) {
    return { data: null, error: "Selected date is outside booking hours." };
  }
  const slots = buildTimeSlotsForDate(
    input.date,
    settings.reservationOperatingHours,
    settings.reservationTimeStep,
  );
  if (!slots.includes(input.time)) {
    return { data: null, error: "Selected time is outside booking hours." };
  }

  const guestName = input.guestName.trim();
  const email = input.email.trim();
  const phone = input.phone.trim();
  const eventType = input.eventType?.trim() || null;

  const bookingCode = generateBookingCode();
  const manageToken = generateManageToken();
  const reservedAt = venueWallTimeToUtc(input.date, input.time);
  const admin = createSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const insertPayload: Record<string, unknown> = {
    guest_name: guestName,
    guest_phone: phone || null,
    guest_email: email || null,
    party_size: guestCount,
    reserved_at: reservedAt.toISOString(),
    notes: input.notes?.trim() || null,
    event_type: eventType,
    gdpr_consent_at: nowIso,
    source: input.receptionDesk ? "reservation" : "online",
    status: input.receptionDesk ? "confirmed" : "pending",
    booking_code: bookingCode,
    manage_token: manageToken,
    updated_at: nowIso,
    guest_submitted_at: nowIso,
    wants_grill: input.wantsGrill ?? null,
    suggested_seating: evaluation.recommendationLabel,
    suggested_capacity: evaluation.capacity,
    capacity_status: evaluation.availability,
    capacity_warnings: evaluation.warnings.join(" · ") || null,
    staff_override_capacity: allowFull && evaluation.availability === "full",
  };

  let { data, error } = await admin
    .from("reservations")
    .insert(insertPayload)
    .select(
      "id, booking_code, manage_token, guest_name, guest_email, guest_phone, party_size, reserved_at, status, notes, event_type",
    )
    .single();

  // Backward compatible if capacity columns are not migrated yet.
  if (error && /column .* does not exist/i.test(error.message)) {
    const legacy = await admin
      .from("reservations")
      .insert({
        guest_name: guestName,
        guest_phone: phone || null,
        guest_email: email || null,
        party_size: guestCount,
        reserved_at: reservedAt.toISOString(),
        notes: input.notes?.trim() || null,
        event_type: eventType,
        gdpr_consent_at: nowIso,
        source: input.receptionDesk ? "reservation" : "online",
        status: input.receptionDesk ? "confirmed" : "pending",
        booking_code: bookingCode,
        manage_token: manageToken,
        updated_at: nowIso,
      })
      .select(
        "id, booking_code, manage_token, guest_name, guest_email, guest_phone, party_size, reserved_at, status, notes, event_type",
      )
      .single();
    data = legacy.data;
    error = legacy.error;
  }

  if (error || !data) {
    return { data: null, error: error?.message ?? "Failed to create reservation." };
  }

  return { data: mapPublicRow(data), error: null };
}

export async function fetchReservationByManageToken(
  token: string,
): Promise<{ data: GuestReservationPublic | null; error: string | null }> {
  const manageToken = token.trim();
  if (!manageToken) return { data: null, error: "Missing manage token." };

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("reservations")
    .select(
      "id, booking_code, manage_token, guest_name, guest_email, guest_phone, party_size, reserved_at, status, notes, event_type",
    )
    .eq("manage_token", manageToken)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Reservation not found." };

  const mapped = mapPublicRow(data);
  if (!mapped) {
    return { data: null, error: "This reservation cannot be managed online." };
  }
  return { data: mapped, error: null };
}

export async function updateReservationByManageToken(input: {
  token: string;
  date: string;
  time: string;
  guestCount: number;
  notes?: string;
}): Promise<{ data: GuestReservationPublic | null; error: string | null }> {
  const { data: existing, error: fetchError } = await fetchReservationByManageToken(input.token);
  if (fetchError || !existing) return { data: null, error: fetchError ?? "Not found" };

  if (!isGuestManageableStatus(existing.status)) {
    return {
      data: null,
      error: "This reservation can no longer be changed.",
    };
  }

  const settings = await fetchReservationGuestSettings();
  const capacity = await validateSlotCapacity({
    settings,
    date: input.date,
    time: input.time,
    guestCount: input.guestCount,
    excludeReservationId: existing.id,
  });
  if (!capacity.ok) return { data: null, error: capacity.error };

  const reservedAt = venueWallTimeToUtc(input.date, input.time);
  const admin = createSupabaseAdmin();
  const nowIso = new Date().toISOString();
  let { data, error } = await admin
    .from("reservations")
    .update({
      party_size: capacity.guestCount,
      reserved_at: reservedAt.toISOString(),
      notes: input.notes?.trim() || null,
      status: existing.status === "late" ? "confirmed" : existing.status,
      updated_at: nowIso,
      guest_changed_at: nowIso,
    })
    .eq("id", existing.id)
    .select(
      "id, booking_code, manage_token, guest_name, guest_email, guest_phone, party_size, reserved_at, status, notes, event_type",
    )
    .single();

  if (error && /guest_changed_at/i.test(error.message)) {
    const legacy = await admin
      .from("reservations")
      .update({
        party_size: capacity.guestCount,
        reserved_at: reservedAt.toISOString(),
        notes: input.notes?.trim() || null,
        status: existing.status === "late" ? "confirmed" : existing.status,
        updated_at: nowIso,
      })
      .eq("id", existing.id)
      .select(
        "id, booking_code, manage_token, guest_name, guest_email, guest_phone, party_size, reserved_at, status, notes, event_type",
      )
      .single();
    data = legacy.data;
    error = legacy.error;
  }

  if (error || !data) {
    return { data: null, error: error?.message ?? "Failed to update reservation." };
  }

  return { data: mapPublicRow(data), error: null };
}

export async function cancelReservationByManageToken(
  token: string,
): Promise<{ data: GuestReservationPublic | null; error: string | null }> {
  const { data: existing, error: fetchError } = await fetchReservationByManageToken(token);
  if (fetchError || !existing) return { data: null, error: fetchError ?? "Not found" };

  if (!isGuestManageableStatus(existing.status)) {
    return {
      data: null,
      error: "This reservation can no longer be cancelled online.",
    };
  }

  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();
  let { data, error } = await admin
    .from("reservations")
    .update({
      status: "cancelled",
      updated_at: now,
      guest_changed_at: now,
      cancelled_at: now,
      cancelled_by: "guest",
      cancellation_reason: "customer",
    })
    .eq("id", existing.id)
    .select(
      "id, booking_code, manage_token, guest_name, guest_email, guest_phone, party_size, reserved_at, status, notes, event_type",
    )
    .single();

  if (error && /column .* does not exist/i.test(error.message)) {
    const legacy = await admin
      .from("reservations")
      .update({
        status: "cancelled",
        updated_at: now,
      })
      .eq("id", existing.id)
      .select(
        "id, booking_code, manage_token, guest_name, guest_email, guest_phone, party_size, reserved_at, status, notes, event_type",
      )
      .single();
    data = legacy.data;
    error = legacy.error;
  }

  if (error || !data) {
    return { data: null, error: error?.message ?? "Failed to cancel reservation." };
  }

  return { data: mapPublicRow(data), error: null };
}

export async function confirmReservationServer(reservationId: string): Promise<{
  data: GuestReservationPublic | null;
  error: string | null;
}> {
  const codes = await ensureReservationCodes(reservationId);
  if (codes.error) return { data: null, error: codes.error.message };

  const admin = createSupabaseAdmin();
  const { data: existing, error: fetchError } = await admin
    .from("reservations")
    .select("status")
    .eq("id", reservationId)
    .single();

  if (fetchError || !existing) {
    return { data: null, error: fetchError?.message ?? "Reservation not found." };
  }

  if (existing.status !== "pending") {
    return { data: null, error: "Only pending reservations can be confirmed." };
  }

  const { data, error } = await admin
    .from("reservations")
    .update({
      status: "confirmed",
      booking_code: codes.bookingCode,
      manage_token: codes.manageToken,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reservationId)
    .select(
      "id, booking_code, manage_token, guest_name, guest_email, guest_phone, party_size, reserved_at, status, notes, event_type",
    )
    .single();

  if (error || !data) {
    return { data: null, error: error?.message ?? "Failed to confirm reservation." };
  }

  return { data: mapPublicRow(data), error: null };
}

export async function fetchReservationEmailContext(reservationId: string): Promise<{
  data: (GuestReservationPublic & { cancellationReason?: string | null }) | null;
  error: string | null;
}> {
  const codes = await ensureReservationCodes(reservationId);
  if (codes.error) return { data: null, error: codes.error.message };

  const admin = createSupabaseAdmin();
  let { data, error } = await admin
    .from("reservations")
    .select(
      "id, booking_code, manage_token, guest_name, guest_email, guest_phone, party_size, reserved_at, status, notes, event_type, cancellation_reason",
    )
    .eq("id", reservationId)
    .single();

  if (error && /column .* does not exist/i.test(error.message)) {
    const legacy = await admin
      .from("reservations")
      .select(
        "id, booking_code, manage_token, guest_name, guest_email, guest_phone, party_size, reserved_at, status, notes, event_type",
      )
      .eq("id", reservationId)
      .single();
    data = legacy.data as typeof data;
    error = legacy.error;
  }

  if (error || !data) {
    return { data: null, error: error?.message ?? "Reservation not found." };
  }

  const mapped = mapPublicRow(data);
  if (!mapped) return { data: null, error: "Reservation not found." };

  return {
    data: {
      ...mapped,
      cancellationReason:
        "cancellation_reason" in data
          ? ((data as { cancellation_reason?: string | null }).cancellation_reason ?? null)
          : null,
    },
    error: null,
  };
}

/** Guest page success popup copy (for API responses if needed). */
export async function fetchReservationGuestTexts() {
  try {
    const admin = createSupabaseAdmin();
    const { data } = await admin
      .from("settings")
      .select("reservation_guest_texts")
      .eq("id", 1)
      .maybeSingle();
    return parseReservationGuestTexts(data?.reservation_guest_texts);
  } catch {
    return parseReservationGuestTexts(null);
  }
}
