/**
 * Reservation capacity + seating recommendation engine.
 * Guests never see table labels — only Available / Limited / Full.
 * Staff sees recommendations and may override Full.
 */

import {
  buildAllSeatingConfigurations,
  formatSeatingLabels,
  normalizeTableLabel,
  seatingConfigKey,
  type SeatingConfiguration,
} from "@/lib/reservation-floor-plan";
import { parseReservationBbqNotes, type ReservationBbqPreference } from "@/lib/reservation-guest-form";
import { parseTimeToMinutes } from "@/lib/reservation-slots";
import { venueWallTimeToUtc } from "@/lib/venue-timezone";

/** Default assumed dining duration for overlap (minutes). */
export const DEFAULT_RESERVATION_DURATION_MINUTES = 120;

/** When remaining seat share falls below this, surface Limited. */
export const LIMITED_REMAINING_RATIO = 0.35;

export type SlotAvailability = "available" | "limited" | "full";

export type GrillNeed = ReservationBbqPreference | null; // "yes" | "no" | "undecided" | null

export type CapacityReservationInput = {
  id?: string;
  partySize: number;
  /** Actual arrived party size when known (check-in). */
  actualPartySize?: number | null;
  reservedAt: string | Date;
  status: string;
  tableLabel?: string | null;
  secondaryTableLabel?: string | null;
  notes?: string | null;
  wantsGrill?: GrillNeed;
  /** Staff-forced accept past Full for this booking. */
  staffOverrideCapacity?: boolean;
};

export type OccupiedTableInput = {
  label: string;
  /** Table is currently busy on the floor (waiting/ready). */
  occupied: boolean;
  /** When occupancy started (optional). Used to estimate when the table frees. */
  occupiedAt?: string | Date | null;
};

export type CapacityEvaluateInput = {
  dateIso: string;
  time: string;
  partySize: number;
  grill: GrillNeed;
  reservations: CapacityReservationInput[];
  occupiedTables?: OccupiedTableInput[];
  /** Exclude this reservation id when re-evaluating an edit. */
  excludeReservationId?: string;
  durationMinutes?: number;
  /** Soft ceiling used for Limited/Full heuristics (settings max guests/slot). */
  maxGuestsPerSlot?: number;
  /** Hold seats already claimed by in-progress online bookings. */
  heldGuests?: number;
  /** Evaluation clock for POS occupancy windows; defaults to Date.now(). */
  nowMs?: number;
};

export type CapacityEvaluateResult = {
  availability: SlotAvailability;
  /** Best internal seating suggestion (null when Full with no config). */
  recommendation: SeatingConfiguration | null;
  recommendationLabel: string | null;
  capacity: number | null;
  requested: number;
  grillCompatible: boolean;
  warnings: string[];
  /** Human-readable staff summary. */
  staffSummary: string;
  /** Guest-facing short status copy key. */
  guestStatus: SlotAvailability;
  overlappingGuestCount: number;
  remainingSeatEstimate: number;
};

const ACTIVE_STATUSES = new Set([
  "pending",
  "confirmed",
  "checked_in",
  "late",
]);

function resolveGrill(row: CapacityReservationInput): GrillNeed {
  if (row.wantsGrill === "yes" || row.wantsGrill === "no" || row.wantsGrill === "undecided") {
    return row.wantsGrill;
  }
  return parseReservationBbqNotes(row.notes ?? undefined).bbq;
}

function effectivePartySize(row: CapacityReservationInput): number {
  if (row.actualPartySize != null && row.actualPartySize > 0) {
    return row.actualPartySize;
  }
  return Math.max(1, row.partySize || 1);
}

function windowFor(
  dateIso: string,
  time: string,
  durationMinutes: number,
): { startMs: number; endMs: number } {
  const startMs = venueWallTimeToUtc(dateIso, time).getTime();
  return { startMs, endMs: startMs + durationMinutes * 60 * 1000 };
}

function overlaps(
  reservedAt: string | Date,
  durationMinutes: number,
  windowStart: number,
  windowEnd: number,
): boolean {
  const start = new Date(reservedAt).getTime();
  if (Number.isNaN(start)) return false;
  const end = start + durationMinutes * 60 * 1000;
  return start < windowEnd && end > windowStart;
}

function configUsesLabel(config: SeatingConfiguration, label: string): boolean {
  const key = normalizeTableLabel(label);
  return config.labels.some((row) => normalizeTableLabel(row) === key);
}

function assignedLabels(row: CapacityReservationInput): string[] {
  return [row.tableLabel, row.secondaryTableLabel]
    .map(normalizeTableLabel)
    .filter(Boolean);
}

/**
 * Tables blocked for a slot: overlapping reservation assignments, or POS floor
 * occupancy that still overlaps this slot’s dining window.
 *
 * Current POS occupancy only blocks ~the next dining duration (default 2h) from
 * now / occupied_at — it does NOT lock large tables for all future evening slots.
 */
export function blockedTableLabels(input: {
  reservations: CapacityReservationInput[];
  occupiedTables?: OccupiedTableInput[];
  dateIso: string;
  time: string;
  durationMinutes: number;
  excludeReservationId?: string;
  /** Evaluation clock; defaults to Date.now(). */
  nowMs?: number;
}): Set<string> {
  const blocked = new Set<string>();
  const { startMs, endMs } = windowFor(input.dateIso, input.time, input.durationMinutes);
  const nowMs = input.nowMs ?? Date.now();
  const durationMs = input.durationMinutes * 60 * 1000;

  for (const table of input.occupiedTables ?? []) {
    if (!table.occupied) continue;
    const occupiedStartRaw = table.occupiedAt ? new Date(table.occupiedAt).getTime() : NaN;
    // If still occupied past the original expected end, keep blocking from "now".
    const occupiedStart = Number.isFinite(occupiedStartRaw)
      ? Math.max(occupiedStartRaw, nowMs - durationMs)
      : nowMs;
    const occupiedEnd = occupiedStart + durationMs;
    if (occupiedStart < endMs && occupiedEnd > startMs) {
      blocked.add(normalizeTableLabel(table.label));
    }
  }

  for (const row of input.reservations) {
    if (input.excludeReservationId && row.id === input.excludeReservationId) continue;
    if (!ACTIVE_STATUSES.has(row.status)) continue;
    if (!overlaps(row.reservedAt, input.durationMinutes, startMs, endMs)) continue;
    for (const label of assignedLabels(row)) blocked.add(label);
  }

  return blocked;
}

function grillSatisfied(config: SeatingConfiguration, need: GrillNeed): boolean {
  if (need === "yes") return config.grill;
  // no / undecided / null — any table OK
  return true;
}

function scoreConfiguration(
  config: SeatingConfiguration,
  partySize: number,
  grill: GrillNeed,
): number {
  // Prefer exact-fit single tables, then spare seats, then extended A1 combos last.
  let score = 0;
  const spare = config.capacity - partySize;
  score += Math.max(0, 40 - spare * 3);
  if (!config.extended) score += 25;
  if (grill === "yes" && config.grill) score += 10;
  if (grill !== "yes" && !config.grill) score += 5;
  // Prefer keeping large 10-tops for larger parties when party is small
  if (partySize <= 4 && config.capacity >= 10) score -= 8;
  if (partySize <= 2 && config.capacity >= 4) score -= 4;
  return score;
}

export function recommendSeating(
  partySize: number,
  grill: GrillNeed,
  blocked: Set<string>,
): SeatingConfiguration | null {
  const candidates = buildAllSeatingConfigurations()
    .filter((config) => config.capacity >= partySize)
    .filter((config) => grillSatisfied(config, grill))
    .filter((config) => config.labels.every((label) => !blocked.has(normalizeTableLabel(label))))
    .sort(
      (a, b) =>
        scoreConfiguration(b, partySize, grill) - scoreConfiguration(a, partySize, grill) ||
        a.capacity - b.capacity ||
        seatingConfigKey(a.labels).localeCompare(seatingConfigKey(b.labels)),
    );

  return candidates[0] ?? null;
}

export function evaluateReservationCapacity(
  input: CapacityEvaluateInput,
): CapacityEvaluateResult {
  const duration = input.durationMinutes ?? DEFAULT_RESERVATION_DURATION_MINUTES;
  const partySize = Math.max(1, input.partySize);
  const grill = input.grill ?? null;
  const held = Math.max(0, input.heldGuests ?? 0);
  const { startMs, endMs } = windowFor(input.dateIso, input.time, duration);

  let overlappingGuestCount = held;
  for (const row of input.reservations) {
    if (input.excludeReservationId && row.id === input.excludeReservationId) continue;
    if (!ACTIVE_STATUSES.has(row.status)) continue;
    if (!overlaps(row.reservedAt, duration, startMs, endMs)) continue;
    overlappingGuestCount += effectivePartySize(row);
  }

  const blocked = blockedTableLabels({
    reservations: input.reservations,
    occupiedTables: input.occupiedTables,
    dateIso: input.dateIso,
    time: input.time,
    durationMinutes: duration,
    excludeReservationId: input.excludeReservationId,
    nowMs: input.nowMs,
  });

  const recommendation = recommendSeating(partySize, grill, blocked);
  const warnings: string[] = [];

  if (grill === "yes" && recommendation && !recommendation.grill) {
    warnings.push("Grill preference may not be met.");
  }
  if (grill === "yes" && !recommendation) {
    warnings.push("No grill-compatible table configuration is free for this party size.");
  }
  if (!recommendation) {
    warnings.push("No free seating configuration fits this party at this time.");
  }
  if (recommendation?.extended) {
    warnings.push(
      `Requires combined seating ${formatSeatingLabels(recommendation.labels)} (capacity ${recommendation.capacity}).`,
    );
  }

  const maxGuests = input.maxGuestsPerSlot ?? 40;
  const remainingSeatEstimate = Math.max(0, maxGuests - overlappingGuestCount);
  const softTight = overlappingGuestCount + partySize > maxGuests;

  let availability: SlotAvailability;
  // Full only when no free seating configuration fits.
  // Soft seat-cap pressure becomes Limited — never hide a free table behind Full.
  if (!recommendation) {
    availability = "full";
  } else {
    const remainingRatio = remainingSeatEstimate / Math.max(1, maxGuests);
    const onlyExtendedLeft =
      recommendation.extended ||
      (partySize > 10 && recommendation.labels[0] === "A1");
    if (
      softTight ||
      remainingRatio <= LIMITED_REMAINING_RATIO ||
      onlyExtendedLeft ||
      partySize >= 9
    ) {
      availability = "limited";
      if (softTight || remainingRatio <= LIMITED_REMAINING_RATIO) {
        warnings.push("Online capacity is getting tight for this slot.");
      }
    } else {
      availability = "available";
    }
  }

  const staffSummary = recommendation
    ? `Suggested: ${formatSeatingLabels(recommendation.labels)} · Capacity ${recommendation.capacity} · Requested ${partySize} · Grill ${
        grill === "yes" ? "required" : grill === "no" ? "no" : "flexible"
      } · ${availability.toUpperCase()}`
    : `No seating recommendation · Requested ${partySize} · ${availability.toUpperCase()}`;

  return {
    availability,
    recommendation,
    recommendationLabel: recommendation ? formatSeatingLabels(recommendation.labels) : null,
    capacity: recommendation?.capacity ?? null,
    requested: partySize,
    grillCompatible: recommendation ? grillSatisfied(recommendation, grill) : false,
    warnings,
    staffSummary,
    guestStatus: availability,
    overlappingGuestCount,
    remainingSeatEstimate,
  };
}

/** Map many slots for the booking UI. */
export function evaluateSlotsForGuest(params: {
  dateIso: string;
  times: string[];
  partySize: number;
  grill: GrillNeed;
  reservations: CapacityReservationInput[];
  occupiedTables?: OccupiedTableInput[];
  durationMinutes?: number;
  maxGuestsPerSlot?: number;
  heldGuestsByTime?: Record<string, number>;
}): Array<{ time: string; result: CapacityEvaluateResult }> {
  return params.times.map((time) => ({
    time,
    result: evaluateReservationCapacity({
      dateIso: params.dateIso,
      time,
      partySize: params.partySize,
      grill: params.grill,
      reservations: params.reservations,
      occupiedTables: params.occupiedTables,
      durationMinutes: params.durationMinutes,
      maxGuestsPerSlot: params.maxGuestsPerSlot,
      heldGuests: params.heldGuestsByTime?.[time] ?? 0,
    }),
  }));
}

export function timeFromReservedAt(reservedAt: Date | string): string {
  const date = typeof reservedAt === "string" ? new Date(reservedAt) : reservedAt;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function minutesUntilSlot(dateIso: string, time: string, nowMs = Date.now()): number {
  const start = venueWallTimeToUtc(dateIso, time).getTime();
  return Math.round((start - nowMs) / 60000);
}

export function isValidClockTime(time: string): boolean {
  return Number.isFinite(parseTimeToMinutes(time));
}
