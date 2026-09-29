/**
 * Internal dining-room seating rules (staff/POS only — never shown to guests).
 * Matched to live `tables.label` values (A1, B2, …).
 */

export type FloorGrillCapability = boolean;

export type FloorTableDef = {
  label: string;
  capacity: number;
  grill: FloorGrillCapability;
  /** Only A1 may attach an auxiliary 2-top to reach 12. */
  canExtend?: boolean;
};

/** Canonical floor plan for Seoul Prague. */
export const RESERVATION_FLOOR_TABLES: FloorTableDef[] = [
  { label: "A1", capacity: 10, grill: true, canExtend: true },
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

/** Labels A1 may combine with for max 12 seats. */
export const A1_AUXILIARY_LABELS = ["B1", "B2", "B3", "D4"] as const;

export const A1_EXTENDED_CAPACITY = 12;

export function normalizeTableLabel(label: string | null | undefined): string {
  return (label ?? "").trim().toUpperCase();
}

export function floorTableByLabel(label: string | null | undefined): FloorTableDef | null {
  const key = normalizeTableLabel(label);
  return RESERVATION_FLOOR_TABLES.find((row) => row.label === key) ?? null;
}

export function isA1AuxiliaryLabel(label: string | null | undefined): boolean {
  const key = normalizeTableLabel(label);
  return (A1_AUXILIARY_LABELS as readonly string[]).includes(key);
}

export type SeatingConfiguration = {
  /** Display labels, e.g. ["A1"] or ["A1", "B2"]. */
  labels: string[];
  capacity: number;
  grill: boolean;
  /** True when A1 + auxiliary 2-top. */
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

  const a1 = floorTableByLabel("A1");
  if (a1?.canExtend) {
    for (const aux of A1_AUXILIARY_LABELS) {
      configs.push({
        labels: ["A1", aux],
        capacity: A1_EXTENDED_CAPACITY,
        grill: true,
        extended: true,
      });
    }
  }

  return configs;
}

export function formatSeatingLabels(labels: string[], separator = " + "): string {
  return labels.map(normalizeTableLabel).filter(Boolean).join(separator);
}

export function seatingConfigKey(labels: string[]): string {
  return [...labels.map(normalizeTableLabel)].sort().join("|");
}
