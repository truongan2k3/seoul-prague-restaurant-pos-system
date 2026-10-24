/**
 * Reservation capacity + seating recommendation engine.
 * Guests never see table labels — only Available / Limited / Full.
 * Guest offers and final booking use the same table, BBQ and turnover-gap rules.
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

/** Default assumed dining duration for overlap (minutes). Overridable in Settings. */
export const DEFAULT_RESERVATION_DURATION_MINUTES = 90;
export const DEFAULT_RESERVATION_BUFFER_MINUTES = 0;

/** Legacy settings remain readable, but dining duration is the only seating window. */
export function clampReservationBufferMinutes(_value: unknown): number {
  return DEFAULT_RESERVATION_BUFFER_MINUTES;
}

/** Clamp staff-configured dining window used by the capacity engine. */
export function clampReservationDurationMinutes(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_RESERVATION_DURATION_MINUTES;
  return Math.min(240, Math.max(60, Math.round(n)));
}

/** When remaining seat share falls below this, surface Limited. */
export const LIMITED_REMAINING_RATIO = 0.35;

export type SlotAvailability = "available" | "limited" | "full";

export type GrillNeed = ReservationBbqPreference | null; // "yes" | "no" | "undecided" | null

export type CapacityReservationInput = {
  id?: string;
  partySize: number;
  /** Actual arrived party size when known (check-in). */
  actualPartySize?: number | null;
  checkedInAt?: string | Date | null;
  reservedAt: string | Date;
  status: string;
  tableLabel?: string | null;
  secondaryTableLabel?: string | null;
  tertiaryTableLabel?: string | null;
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
  blocked?: boolean;
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
  bufferMinutes?: number;
  /** Soft ceiling used for Limited/Full heuristics (settings max guests/slot). */
  maxGuestsPerSlot?: number;
  /** Hold seats already claimed by in-progress online bookings. */
  heldGuests?: number;
  /** Evaluation clock for POS occupancy windows; defaults to Date.now(). */
  nowMs?: number;
  /** Request-local reuse across party sizes for the same reservation/floor snapshot. */
  placementCache?: Map<string, boolean>;
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
  /** Distinct seating configurations still free for this party (staff). */
  freeConfigurationCount: number;
};

const ACTIVE_STATUSES = new Set([
  "pending",
  "confirmed",
  "checked_in",
  "late",
]);

export function resolveGrill(row: CapacityReservationInput): GrillNeed {
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
  return [row.tableLabel, row.secondaryTableLabel, row.tertiaryTableLabel]
    .map(normalizeTableLabel)
    .filter(Boolean);
}

export type ReservationAllocation = { labels: string[]; startMs: number; endMs: number; reservationId?: string };

/** Planning only: large staff bookings may need separate tables; never merges or assigns them in POS. */
function planningConfigurations(partySize: number, grill: GrillNeed): SeatingConfiguration[] {
  const singles = buildAllSeatingConfigurations().filter((config) => grillSatisfied(config, grill));
  const suitable = singles.filter((config) => config.capacity >= partySize);
  if (suitable.length) return suitable;
  const groups: SeatingConfiguration[] = [];
  for (let a = 0; a < singles.length; a++) for (let b = a + 1; b < singles.length; b++) {
    const pair = [singles[a], singles[b]];
    const capacity = pair.reduce((sum, config) => sum + config.capacity, 0);
    if (capacity >= partySize) groups.push({ labels: pair.flatMap((config) => config.labels), capacity, grill: pair.every((config) => config.grill), extended: true });
    else for (let c = b + 1; c < singles.length; c++) {
      if (capacity + singles[c].capacity >= partySize) groups.push({ labels: [...pair.flatMap((config) => config.labels), ...singles[c].labels], capacity: capacity + singles[c].capacity, grill: pair.every((config) => config.grill) && singles[c].grill, extended: true });
    }
  }
  return groups.sort((a, b) => a.labels.length - b.labels.length || a.capacity - b.capacity || Number(a.grill) - Number(b.grill));
}

/** Plan unassigned bookings using individual table capacity and BBQ eligibility. */
export function planReservationAllocations(input: {
  reservations: CapacityReservationInput[];
  occupiedTables?: OccupiedTableInput[];
  durationMinutes: number;
  bufferMinutes?: number;
  excludeReservationId?: string;
  nowMs?: number;
}): ReservationAllocation[] {
  const now = input.nowMs ?? Date.now();
  const duration = input.durationMinutes * 60_000;
  const active = input.reservations.filter((r) => ACTIVE_STATUSES.has(r.status)
    && (!input.excludeReservationId || r.id !== input.excludeReservationId));
  const allocations: ReservationAllocation[] = [];
  const window = (r: CapacityReservationInput) => {
    const start = new Date(r.reservedAt).getTime();
    if (r.status !== "checked_in") return { startMs: start, endMs: start + duration };
    const seated = r.checkedInAt ? new Date(r.checkedInAt).getTime() : NaN;
    const floorStarts = assignedLabels(r).map((label) => input.occupiedTables?.find((t) => normalizeTableLabel(t.label) === label)?.occupiedAt)
      .filter((value) => value != null).map((value) => new Date(value!).getTime()).filter(Number.isFinite);
    const occupied = floorStarts.length ? Math.min(...floorStarts) : seated;
    return { startMs: Math.min(now, Number.isFinite(occupied) ? occupied : now),
      endMs: Number.isFinite(occupied) && occupied + duration > now ? occupied + duration : Infinity };
  };
  for (const row of active) {
    const labels = assignedLabels(row);
    if (labels.length) allocations.push({ labels, reservationId: row.id, ...window(row) });
  }
  const unassigned = active.filter((r) => !assignedLabels(r).length)
    .sort((a, b) => new Date(a.reservedAt).getTime() - new Date(b.reservedAt).getTime() || effectivePartySize(b) - effectivePartySize(a));
  const pending = unassigned.map((row) => ({ row, span: window(row) }))
    .filter(({ span }) => Number.isFinite(span.startMs) && span.endMs > now);
  // Independent time ranges can be planned separately. Within a range, reconsider
  // flexible bookings rather than letting an earlier greedy choice consume the only BBQ table.
  for (let offset = 0; offset < pending.length;) {
    const component = [pending[offset++]];
    let end = component[0].span.endMs;
    while (offset < pending.length && pending[offset].span.startMs < end) {
      const next = pending[offset++]; component.push(next); end = Math.max(end, next.span.endMs);
    }
    const domains = component.map(({ row, span }) => {
      const blocked = new Set(allocations.filter((a) => a.startMs < span.endMs && a.endMs > span.startMs).flatMap((a) => a.labels));
      for (const table of input.occupiedTables ?? []) {
        const start = table.occupiedAt ? new Date(table.occupiedAt).getTime() : NaN;
        const release = Number.isFinite(start) && start + duration > now ? start + duration : Infinity;
        if (table.blocked || (table.occupied && release > span.startMs && (!Number.isFinite(start) || start < span.endMs))) blocked.add(normalizeTableLabel(table.label));
      }
      const configs = planningConfigurations(effectivePartySize(row), resolveGrill(row))
        .filter((config) => config.labels.every((label) => !blocked.has(label)))
        .sort((a, b) => a.capacity - b.capacity || Number(a.grill) - Number(b.grill) || seatingConfigKey(a.labels).localeCompare(seatingConfigKey(b.labels)));
      return { row, span, configs };
    }).sort((a, b) => a.configs.length - b.configs.length || effectivePartySize(b.row) - effectivePartySize(a.row));
    const placed: ReservationAllocation[] = [];
    let budget = 4000;
    const place = (index: number): boolean => {
      if (index === domains.length) return true;
      if (--budget < 0) return false;
      const { row, span, configs } = domains[index];
      for (const config of configs) {
        if (placed.some((a) => a.startMs < span.endMs && a.endMs > span.startMs && a.labels.some((label) => config.labels.includes(label)))) continue;
        placed.push({ labels: config.labels, reservationId: row.id, ...span });
        if (place(index + 1)) return true;
        placed.pop();
      }
      return false;
    };
    if (place(0)) allocations.push(...placed);
    else for (const { row, span } of component) {
      // Existing overbookings, or an exhausted search budget, must never advertise spare capacity.
      allocations.push({ labels: buildAllSeatingConfigurations().flatMap((config) => config.labels), reservationId: row.id, ...span });
    }
  }
  return allocations;
}

/**
 * Tables blocked for a slot: overlapping reservation assignments, or POS floor
 * occupancy that still overlaps this slot’s dining window.
 *
 * Current POS occupancy only blocks ~the next dining duration (default 90m,
 * configurable in Settings) from now / occupied_at — it does NOT lock large
 * tables for all future evening slots.
 */
export function blockedTableLabels(input: {
  reservations: CapacityReservationInput[];
  occupiedTables?: OccupiedTableInput[];
  dateIso: string;
  time: string;
  durationMinutes: number;
  bufferMinutes?: number;
  excludeReservationId?: string;
  /** Evaluation clock; defaults to Date.now(). */
  nowMs?: number;
}): Set<string> {
  const blocked = new Set<string>();
  const window = windowFor(input.dateIso, input.time, input.durationMinutes);
  const startMs = window.startMs;
  const endMs = window.endMs;
  const nowMs = input.nowMs ?? Date.now();
  const durationMs = input.durationMinutes * 60 * 1000;

  for (const table of input.occupiedTables ?? []) {
    if (table.blocked) { blocked.add(normalizeTableLabel(table.label)); continue; }
    if (!table.occupied) continue;
    const occupiedStartRaw = table.occupiedAt ? new Date(table.occupiedAt).getTime() : NaN;
    // If still occupied past the original expected end, keep blocking from "now".
    const occupiedStart = Number.isFinite(occupiedStartRaw) ? Math.min(occupiedStartRaw, nowMs) : nowMs;
    const occupiedEnd = Number.isFinite(occupiedStartRaw) && occupiedStartRaw + durationMs > nowMs
      ? occupiedStartRaw + durationMs : Infinity;
    if (occupiedStart < endMs && occupiedEnd > startMs) {
      blocked.add(normalizeTableLabel(table.label));
    }
  }

  for (const allocation of planReservationAllocations(input)) {
    if (allocation.startMs < endMs && allocation.endMs > startMs) {
      for (const label of allocation.labels) blocked.add(label);
    }
  }

  return blocked;
}

function grillSatisfied(config: SeatingConfiguration, need: GrillNeed): boolean {
  if (need === "yes") return config.grill;
  // no / undecided / null — any table OK
  return true;
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
        a.capacity - b.capacity || Number(a.grill) - Number(b.grill) ||
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
    bufferMinutes: input.bufferMinutes,
    excludeReservationId: input.excludeReservationId,
    nowMs: input.nowMs,
  });

  const fixedBlocked = blockedTableLabels({ ...input, reservations: input.reservations.filter((row) => assignedLabels(row).length), durationMinutes: duration });
  const candidateId = "__guest_availability_candidate__";
  const feasible = buildAllSeatingConfigurations()
    .filter((config) => config.capacity >= partySize)
    .filter((config) => grillSatisfied(config, grill))
    .filter((config) => config.labels.every((label) => !fixedBlocked.has(normalizeTableLabel(label))))
    .filter((config) => {
      const key = `${input.dateIso}:${input.time}:${duration}:${input.excludeReservationId ?? ""}:${config.labels.join("+")}`;
      const cached = input.placementCache?.get(key);
      if (cached !== undefined) return cached;
      const planned = planReservationAllocations({ ...input, durationMinutes: duration,
        reservations: [...input.reservations, { id: candidateId, partySize, reservedAt: new Date(startMs), status: "confirmed", tableLabel: config.labels[0], wantsGrill: grill }] });
      const fits = !planned.some((allocation) => allocation.reservationId !== candidateId && allocation.startMs < endMs && allocation.endMs > startMs
        && allocation.labels.some((label) => config.labels.includes(label)));
      input.placementCache?.set(key, fits);
      return fits;
    })
    .sort((a, b) => a.capacity - b.capacity || Number(a.grill) - Number(b.grill) || seatingConfigKey(a.labels).localeCompare(seatingConfigKey(b.labels)));
  const recommendation = feasible[0] ?? null;
  const freeConfigurationCount = feasible.length;
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
  const remainingSeatEstimate = buildAllSeatingConfigurations()
    .filter((config) => config.labels.every((label) => !blocked.has(normalizeTableLabel(label))))
    .reduce((sum, config) => sum + config.capacity, 0);
  const availability: SlotAvailability = !recommendation ? "full" : freeConfigurationCount === 1 ? "limited" : "available";

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
    freeConfigurationCount,
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
  bufferMinutes?: number;
  maxGuestsPerSlot?: number;
  heldGuestsByTime?: Record<string, number>;
  excludeReservationId?: string;
  placementCache?: Map<string, boolean>;
}): Array<{ time: string; result: CapacityEvaluateResult }> {
  const placementCache = params.placementCache ?? new Map<string, boolean>();
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
      bufferMinutes: params.bufferMinutes,
      maxGuestsPerSlot: params.maxGuestsPerSlot,
      heldGuests: params.heldGuestsByTime?.[time] ?? 0,
      excludeReservationId: params.excludeReservationId,
      placementCache,
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
