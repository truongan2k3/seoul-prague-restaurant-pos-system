import {
  buildTimeSlotsForDate,
  countGuestsInSlot,
  DEFAULT_RESERVATION_OPERATING_HOURS,
  getWeekdayKey,
  type SlotCapacityRow,
} from "@/lib/reservation-slots";
import { generateBookingCode, generateManageToken } from "@/lib/reservation-codes";
import type { AppSettings, ReservationOperatingHours, ReservationStatus } from "@/lib/types";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";

export interface OnlineBookInput {
  guestName: string;
  email: string;
  phone: string;
  guestCount: number;
  date: string;
  time: string;
  notes?: string;
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
}

const MANAGEABLE_STATUSES: ReservationStatus[] = ["pending", "confirmed", "late"];

type ReservationSettings = Pick<
  AppSettings,
  | "reservationTimeStep"
  | "reservationMaxGuestsPerSlot"
  | "reservationOperatingHours"
>;

const DEFAULT_RESERVATION_SETTINGS: ReservationSettings = {
  reservationTimeStep: 30,
  reservationMaxGuestsPerSlot: 20,
  reservationOperatingHours: DEFAULT_RESERVATION_OPERATING_HOURS,
};

function parseOperatingHours(value: unknown): ReservationOperatingHours {
  if (!value || typeof value !== "object") return DEFAULT_RESERVATION_OPERATING_HOURS;
  return {
    ...DEFAULT_RESERVATION_OPERATING_HOURS,
    ...(value as ReservationOperatingHours),
  };
}

async function fetchReservationSettings(): Promise<ReservationSettings> {
  try {
    const admin = createSupabaseAdmin();
    const { data } = await admin
      .from("settings")
      .select(
        "reservation_time_step, reservation_max_guests_per_slot, reservation_operating_hours",
      )
      .eq("id", 1)
      .maybeSingle();

    if (!data) return DEFAULT_RESERVATION_SETTINGS;

    return {
      reservationTimeStep:
        data.reservation_time_step ?? DEFAULT_RESERVATION_SETTINGS.reservationTimeStep,
      reservationMaxGuestsPerSlot:
        data.reservation_max_guests_per_slot ??
        DEFAULT_RESERVATION_SETTINGS.reservationMaxGuestsPerSlot,
      reservationOperatingHours: parseOperatingHours(data.reservation_operating_hours),
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

async function validateSlotCapacity(params: {
  settings: ReservationSettings;
  date: string;
  time: string;
  guestCount: number;
  excludeReservationId?: string;
}): Promise<{ ok: true; guestCount: number } | { ok: false; error: string }> {
  const { settings, date, time, excludeReservationId } = params;
  const reservedAt = new Date(`${date}T${time}:00`);
  const dayKey = getWeekdayKey(reservedAt);
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

  const start = `${date}T00:00:00`;
  const end = `${date}T23:59:59`;
  const admin = createSupabaseAdmin();
  const { data: existingRows, error: fetchError } = await admin
    .from("reservations")
    .select("id, party_size, reserved_at, status")
    .gte("reserved_at", start)
    .lte("reserved_at", end);

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

export async function createOnlineReservationServer(input: OnlineBookInput): Promise<{
  data: GuestReservationPublic | null;
  error: string | null;
}> {
  const guestName = input.guestName.trim();
  const email = input.email.trim();
  const phone = input.phone.trim();

  if (!guestName) return { data: null, error: "Please enter your name." };
  if (!email) return { data: null, error: "Please enter your email." };
  if (!phone || phone === "+420") return { data: null, error: "Please enter your phone number." };
  if (!input.date || !input.time) {
    return { data: null, error: "Please select a date and time." };
  }

  const settings = await fetchReservationSettings();
  const capacity = await validateSlotCapacity({
    settings,
    date: input.date,
    time: input.time,
    guestCount: input.guestCount,
  });
  if (!capacity.ok) return { data: null, error: capacity.error };

  const bookingCode = generateBookingCode();
  const manageToken = generateManageToken();
  const reservedAt = new Date(`${input.date}T${input.time}:00`);
  const admin = createSupabaseAdmin();

  const { data, error } = await admin
    .from("reservations")
    .insert({
      guest_name: guestName,
      guest_phone: phone,
      guest_email: email,
      party_size: capacity.guestCount,
      reserved_at: reservedAt.toISOString(),
      notes: input.notes?.trim() || null,
      source: "reservation",
      status: "pending",
      booking_code: bookingCode,
      manage_token: manageToken,
      updated_at: new Date().toISOString(),
    })
    .select(
      "id, booking_code, manage_token, guest_name, guest_email, guest_phone, party_size, reserved_at, status, notes",
    )
    .single();

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
      "id, booking_code, manage_token, guest_name, guest_email, guest_phone, party_size, reserved_at, status, notes",
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

  const settings = await fetchReservationSettings();
  const capacity = await validateSlotCapacity({
    settings,
    date: input.date,
    time: input.time,
    guestCount: input.guestCount,
    excludeReservationId: existing.id,
  });
  if (!capacity.ok) return { data: null, error: capacity.error };

  const reservedAt = new Date(`${input.date}T${input.time}:00`);
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("reservations")
    .update({
      party_size: capacity.guestCount,
      reserved_at: reservedAt.toISOString(),
      notes: input.notes?.trim() || null,
      status: existing.status === "late" ? "confirmed" : existing.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id)
    .select(
      "id, booking_code, manage_token, guest_name, guest_email, guest_phone, party_size, reserved_at, status, notes",
    )
    .single();

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
  const { data, error } = await admin
    .from("reservations")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id)
    .select(
      "id, booking_code, manage_token, guest_name, guest_email, guest_phone, party_size, reserved_at, status, notes",
    )
    .single();

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
      "id, booking_code, manage_token, guest_name, guest_email, guest_phone, party_size, reserved_at, status, notes",
    )
    .single();

  if (error || !data) {
    return { data: null, error: error?.message ?? "Failed to confirm reservation." };
  }

  return { data: mapPublicRow(data), error: null };
}

export async function fetchReservationEmailContext(reservationId: string): Promise<{
  data: GuestReservationPublic | null;
  error: string | null;
}> {
  const codes = await ensureReservationCodes(reservationId);
  if (codes.error) return { data: null, error: codes.error.message };

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("reservations")
    .select(
      "id, booking_code, manage_token, guest_name, guest_email, guest_phone, party_size, reserved_at, status, notes",
    )
    .eq("id", reservationId)
    .single();

  if (error || !data) {
    return { data: null, error: error?.message ?? "Reservation not found." };
  }

  return { data: mapPublicRow(data), error: null };
}
