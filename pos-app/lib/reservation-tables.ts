/** Shared helpers for reservations that may span up to 2 tables. */

import type { ReservationRecord } from "@/lib/types";

export const MAX_RESERVATION_TABLES = 2;

/** Normalize to 1–2 unique table ids (order preserved). */
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

/** Display labels for a reservation (primary then secondary). */
export function reservationTableLabels(row: Pick<ReservationRecord, "tableLabel" | "secondaryTableLabel">): string[] {
  return [row.tableLabel?.trim(), row.secondaryTableLabel?.trim()].filter(
    (label): label is string => Boolean(label),
  );
}

export function formatReservationTableLabels(
  row: Pick<ReservationRecord, "tableLabel" | "secondaryTableLabel">,
  separator = " · ",
): string {
  return reservationTableLabels(row).join(separator);
}
