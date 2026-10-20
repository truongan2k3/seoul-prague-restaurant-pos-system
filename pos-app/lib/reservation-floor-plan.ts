/**
 * Internal dining-room seating rules (staff/POS only — never shown to guests).
 * Matched to live `tables.label` values (A1, B2, …).
 */

export type FloorGrillCapability = boolean;

export type FloorTableDef = {
  label: string;
  capacity: number;
  grill: FloorGrillCapability;
};

/** Canonical floor plan for Seoul Prague. */
export const RESERVATION_FLOOR_TABLES: FloorTableDef[] = [
  { label: "A1", capacity: 10, grill: true },
  { label: "A2", capacity: 10, grill: true },
  { label: "A3", capacity: 10, grill: true },
  { label: "D1", capacity: 10, grill: true },
  { label: "C1", capacity: 4, grill: true },
  { label: "C2", capacity: 4, grill: true },
  { label: "C3", capacity: 4, grill: true },
  { label: "D2", capacity: 4, grill: true },
  { label: "D3", capacity: 4, grill: true },
  { label: "B1", capacity: 2, grill: false },
  { label: "B2", capacity: 2, grill: false },
  { label: "B3", capacity: 2, grill: false },
  { label: "D4", capacity: 2, grill: false },
];

export function normalizeTableLabel(label: string | null | undefined): string {
  return (label ?? "").trim().toUpperCase();
}

export function floorTableByLabel(label: string | null | undefined): FloorTableDef | null {
  const key = normalizeTableLabel(label);
  return RESERVATION_FLOOR_TABLES.find((row) => row.label === key) ?? null;
}

export type SeatingConfiguration = {
  /** Exactly one physical table for every new seating configuration. */
  labels: string[];
  capacity: number;
  grill: boolean;
  /** Kept for historical callers; new configurations are never combined. */
  extended: boolean;
};

/** All valid seating configurations the engine may recommend. */
export function buildAllSeatingConfigurations(): SeatingConfiguration[] {
  const configs: SeatingConfiguration[] = [];

  for (const table of RESERVATION_FLOOR_TABLES) {
    configs.push({
      labels: [table.label],
      capacity: table.capacity,
      grill: table.grill,
      extended: false,
    });
  }

  return configs;
}

export function formatSeatingLabels(labels: string[], separator = " + "): string {
  return labels.map(normalizeTableLabel).filter(Boolean).join(separator);
}

export function seatingConfigKey(labels: string[]): string {
  return [...labels.map(normalizeTableLabel)].sort().join("|");
}
