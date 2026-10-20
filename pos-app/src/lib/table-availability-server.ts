import "server-only";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";
import { floorTableByLabel, normalizeTableLabel } from "@/lib/reservation-floor-plan";
import { clampReservationDurationMinutes, clampReservationBufferMinutes, resolveGrill,
  type CapacityReservationInput } from "@/lib/reservation-capacity-engine";
import { calculateTableAvailability, type TableAvailabilitySource } from "@/lib/table-availability";

export async function loadLiveTableAvailability(businessId: string | null) {
  const db = createSupabaseAdmin();
  const { data, error } = await db.rpc("live_table_availability_snapshot", { p_business: businessId });
  if (error) throw Object.assign(new Error(`Live availability could not be loaded: ${error.message}`), { code: error.code });
  if (!data) throw new Error("Live availability returned no data. Apply supabase/patch-live-table-availability.sql.");
  const raw = data as {
    serverNow: string; settings: { duration?: number; buffer?: number } | null;
    tables: { id: string; label: string; status: string; occupiedAt: string | null; blocked: boolean }[];
    reservations: CapacityReservationInput[];
  };
  const seen = new Set<string>();
  const source: TableAvailabilitySource = {
    serverNow: raw.serverNow,
    durationMinutes: clampReservationDurationMinutes(raw.settings?.duration),
    bufferMinutes: clampReservationBufferMinutes(raw.settings?.buffer),
    tables: raw.tables.flatMap((table) => {
      const def = floorTableByLabel(table.label);
      const label = normalizeTableLabel(table.label);
      if (!def || seen.has(label)) return [];
      seen.add(label);
      return [{ id: table.id, label, capacity: def.capacity, grill: def.grill,
        occupied: table.status === "waiting" || table.status === "ready", occupiedAt: table.occupiedAt,
        blocked: table.blocked || !["empty", "waiting", "ready"].includes(table.status) }];
    }),
    // Strip free-text notes, contacts and all guest identifiers before serializing.
    reservations: raw.reservations.map((row) => ({ id: row.id, partySize: row.partySize,
      actualPartySize: row.actualPartySize, reservedAt: row.reservedAt, checkedInAt: row.checkedInAt,
      status: row.status, wantsGrill: resolveGrill(row), tableLabel: row.tableLabel,
      secondaryTableLabel: row.secondaryTableLabel, tertiaryTableLabel: row.tertiaryTableLabel })),
  };
  const { tables: _tables, ...summary } = calculateTableAvailability(source);
  return { source, summary };
}
