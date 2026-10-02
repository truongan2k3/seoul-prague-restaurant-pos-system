/** Shared helpers for reservations that may span up to 3 tables. */

import type { ReservationRecord } from "@/lib/types";

export const MAX_RESERVATION_TABLES = 3;

/** Normalize to 1–3 unique table ids (order preserved). */
export function normalizeReservationTableIds(tableIds: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tableIds) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_RESERVATION_TABLES) break;
  }
  return out;
}

/** Linked table ids on a reservation (primary → tertiary). */
export function reservationLinkedTableIds(
  row: Pick<ReservationRecord, "tableId" | "secondaryTableId" | "tertiaryTableId">,
): string[] {
  return normalizeReservationTableIds([row.tableId, row.secondaryTableId, row.tertiaryTableId]);
}

/** Display labels for a reservation (primary then extra tables). */
export function reservationTableLabels(
  row: Pick<ReservationRecord, "tableLabel" | "secondaryTableLabel" | "tertiaryTableLabel">,
): string[] {
  return [row.tableLabel?.trim(), row.secondaryTableLabel?.trim(), row.tertiaryTableLabel?.trim()].filter(
    (label): label is string => Boolean(label),
  );
}

export function formatReservationTableLabels(
  row: Pick<ReservationRecord, "tableLabel" | "secondaryTableLabel" | "tertiaryTableLabel">,
  separator = " · ",
): string {
  return reservationTableLabels(row).join(separator);
}

/** Split normalized ids into primary / secondary / tertiary columns. */
export function reservationTableIdColumns(tableIds: Array<string | null | undefined>): {
  tableId: string | null;
  secondaryTableId: string | null;
  tertiaryTableId: string | null;
} {
  const ids = normalizeReservationTableIds(tableIds);
  return {
    tableId: ids[0] ?? null,
    secondaryTableId: ids[1] ?? null,
    tertiaryTableId: ids[2] ?? null,
  };
}
