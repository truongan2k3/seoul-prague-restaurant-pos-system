/**
 * Reservation capacity + seating recommendation engine.
 * Guests never see table labels — only Available / Limited / Full.
 * Staff sees recommendations and may override Full.
 *
 * Core rules (no soft-cap loopholes):
 * 1. Physically block tables from overlapping assignments + POS occupancy windows.
 * 2. Greedily pack unassigned overlapping reservations + online holds onto configs.
 * 3. Recommend seating for the new party on what remains.
 * 4. Full  = no fitting free configuration after packing.
 * 5. Limited = fitting config exists, but scarcity / awkward seating / soft pressure.
 * 6. Available = healthy leftover fitting options.
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

/**
 * Limited when this many (or fewer) fitting configs remain after packing demand.
 * 1 = only the recommended option left → Limited.
 */
export const LIMITED_FITTING_CONFIGS = 1;

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
  /** Soft online pressure ceiling — Limited warning only, never forces Full alone. */
  maxGuestsPerSlot?: number;
  /** Hold seats already claimed by in-progress online bookings. */
  heldGuests?: number;
  /** Individual hold parties (preferred over heldGuests blob when provided). */
  heldParties?: Array<{ partySize: number; wantsGrill?: GrillNeed }>;
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
  /** How many fitting configs remain for this party after packing demand. */
  fittingConfigCount: number;
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

function assignedLabels(row: CapacityReservationInput): string[] {
  return [row.tableLabel, row.secondaryTableLabel]
    .map(normalizeTableLabel)
    .filter(Boolean);
}

/**
 * POS occupancy window for a currently busy table.
 * Still-occupied tables always cover at least [now, now+duration] residual time,
 * even if occupied_at is older than one dining turn.
 */
export function occupancyWindowMs(
  table: OccupiedTableInput,
  durationMinutes: number,
  nowMs = Date.now(),
): { startMs: number; endMs: number } | null {
  if (!table.occupied) return null;
  const durationMs = durationMinutes * 60 * 1000;
  const occupiedStartRaw = table.occupiedAt ? new Date(table.occupiedAt).getTime() : NaN;
  const occupiedStart = Number.isFinite(occupiedStartRaw)
    ? Math.max(occupiedStartRaw, nowMs - durationMs)
    : nowMs;
  return { startMs: occupiedStart, endMs: occupiedStart + durationMs };
}

/**
 * Tables blocked for a slot: overlapping reservation assignments, or POS floor
 * occupancy that still overlaps this slot’s dining window.
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

  for (const table of input.occupiedTables ?? []) {
    const window = occupancyWindowMs(table, input.durationMinutes, nowMs);
    if (!window) continue;
    if (window.startMs < endMs && window.endMs > startMs) {
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
  return true;
}

function scoreConfiguration(
  config: SeatingConfiguration,
  partySize: number,
  grill: GrillNeed,
): number {
  let score = 0;
  const spare = config.capacity - partySize;
  score += Math.max(0, 40 - spare * 3);
  if (!config.extended) score += 25;
  if (grill === "yes" && config.grill) score += 10;
  if (grill !== "yes" && !config.grill) score += 5;
  // Preserve large 10-tops for larger parties when the request is small.
  if (partySize <= 4 && config.capacity >= 10) score -= 8;
  if (partySize <= 2 && config.capacity >= 4) score -= 4;
  return score;
}

export function listFittingConfigurations(
  partySize: number,
  grill: GrillNeed,
  blocked: Set<string>,
): SeatingConfiguration[] {
  return buildAllSeatingConfigurations()
    .filter((config) => config.capacity >= partySize)
    .filter((config) => grillSatisfied(config, grill))
    .filter((config) => config.labels.every((label) => !blocked.has(normalizeTableLabel(label))))
    .sort(
      (a, b) =>
        scoreConfiguration(b, partySize, grill) - scoreConfiguration(a, partySize, grill) ||
        a.capacity - b.capacity ||
        seatingConfigKey(a.labels).localeCompare(seatingConfigKey(b.labels)),
    );
}

export function recommendSeating(
  partySize: number,
  grill: GrillNeed,
  blocked: Set<string>,
): SeatingConfiguration | null {
  return listFittingConfigurations(partySize, grill, blocked)[0] ?? null;
}

type VirtualParty = {
  partySize: number;
  grill: GrillNeed;
  /** Larger parties pack first so they don't get stranded. */
  reservedAtMs: number;
};

/**
 * Consume seating for unassigned overlapping demand (reservations + holds)
 * so free tables cannot be double-sold.
 */
export function packUnassignedDemand(input: {
  blocked: Set<string>;
  parties: VirtualParty[];
}): { blocked: Set<string>; unseatedGuests: number; packedCount: number } {
  const blocked = new Set(input.blocked);
  let unseatedGuests = 0;
  let packedCount = 0;

  const ordered = [...input.parties].sort(
    (a, b) =>
      b.partySize - a.partySize ||
      a.reservedAtMs - b.reservedAtMs ||
      (a.grill === "yes" ? -1 : 1) - (b.grill === "yes" ? -1 : 1),
  );

  for (const party of ordered) {
    const config = recommendSeating(party.partySize, party.grill, blocked);
    if (!config) {
      unseatedGuests += party.partySize;
      continue;
    }
    packedCount += 1;
    for (const label of config.labels) blocked.add(normalizeTableLabel(label));
  }

  return { blocked, unseatedGuests, packedCount };
}

function buildVirtualParties(input: {
  reservations: CapacityReservationInput[];
  excludeReservationId?: string;
  durationMinutes: number;
  startMs: number;
  endMs: number;
  heldGuests?: number;
  heldParties?: Array<{ partySize: number; wantsGrill?: GrillNeed }>;
}): VirtualParty[] {
  const parties: VirtualParty[] = [];

  for (const row of input.reservations) {
    if (input.excludeReservationId && row.id === input.excludeReservationId) continue;
    if (!ACTIVE_STATUSES.has(row.status)) continue;
    if (!overlaps(row.reservedAt, input.durationMinutes, input.startMs, input.endMs)) continue;
    // Assigned bookings already consume tables via blockedTableLabels.
    if (assignedLabels(row).length > 0) continue;
    parties.push({
      partySize: effectivePartySize(row),
      grill: resolveGrill(row),
      reservedAtMs: new Date(row.reservedAt).getTime(),
    });
  }

  if (input.heldParties && input.heldParties.length > 0) {
    for (const hold of input.heldParties) {
      parties.push({
        partySize: Math.max(1, hold.partySize),
        grill: hold.wantsGrill ?? null,
        reservedAtMs: input.startMs,
      });
    }
  } else if ((input.heldGuests ?? 0) > 0) {
    parties.push({
      partySize: Math.max(1, input.heldGuests ?? 1),
      grill: null,
      reservedAtMs: input.startMs,
    });
  }

  return parties;
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

  const physicalBlocked = blockedTableLabels({
    reservations: input.reservations,
    occupiedTables: input.occupiedTables,
    dateIso: input.dateIso,
    time: input.time,
    durationMinutes: duration,
    excludeReservationId: input.excludeReservationId,
    nowMs: input.nowMs,
  });

  const virtualParties = buildVirtualParties({
    reservations: input.reservations,
    excludeReservationId: input.excludeReservationId,
    durationMinutes: duration,
    startMs,
    endMs,
    heldGuests: input.heldGuests,
    heldParties: input.heldParties,
  });

  const packed = packUnassignedDemand({
    blocked: physicalBlocked,
    parties: virtualParties,
  });

  const fitting = listFittingConfigurations(partySize, grill, packed.blocked);
  const recommendation = fitting[0] ?? null;
  const fittingConfigCount = fitting.length;
  const warnings: string[] = [];

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
  if (packed.unseatedGuests > 0) {
    warnings.push(
      `Existing unassigned demand (~${packed.unseatedGuests} guests) could not be packed into free tables.`,
    );
  }

  const maxGuests = input.maxGuestsPerSlot ?? 40;
  const remainingSeatEstimate = Math.max(0, maxGuests - overlappingGuestCount);
  const softTight = overlappingGuestCount + partySize > maxGuests;

  let availability: SlotAvailability;
  if (!recommendation) {
    availability = "full";
  } else {
    const onlyExtendedLeft =
      recommendation.extended &&
      fitting.every((config) => config.extended || config.capacity < partySize);
    const scarce =
      fittingConfigCount <= LIMITED_FITTING_CONFIGS ||
      onlyExtendedLeft ||
      (recommendation.extended && fittingConfigCount <= 2);

    if (scarce || softTight || packed.unseatedGuests > 0) {
      availability = "limited";
      if (softTight) {
        warnings.push("Online guest pressure for this slot is high.");
      } else if (scarce) {
        warnings.push("Few seating configurations remain for this party size.");
      }
    } else {
      availability = "available";
    }
  }

  const staffSummary = recommendation
    ? `Suggested: ${formatSeatingLabels(recommendation.labels)} · Capacity ${recommendation.capacity} · Requested ${partySize} · Grill ${
        grill === "yes" ? "required" : grill === "no" ? "no" : "flexible"
      } · Options ${fittingConfigCount} · ${availability.toUpperCase()}`
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
    fittingConfigCount,
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
  heldPartiesByTime?: Record<string, Array<{ partySize: number; wantsGrill?: GrillNeed }>>;
  nowMs?: number;
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
      heldParties: params.heldPartiesByTime?.[time],
      nowMs: params.nowMs,
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
