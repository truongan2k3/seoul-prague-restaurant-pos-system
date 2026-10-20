import { NextResponse } from "next/server";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";
import { loadLiveTableAvailability } from "@/src/lib/table-availability-server";
import { calculateTableAvailability } from "@/lib/table-availability";
import { blockedTableLabels, evaluateReservationCapacity, resolveGrill } from "@/lib/reservation-capacity-engine";
import { floorTableByLabel } from "@/lib/reservation-floor-plan";
import { todayIsoDateInVenue } from "@/lib/venue-timezone";
import { loadDayCapacityContext } from "@/src/lib/reservation-guest-server";

async function validateSeating(input: { reservedAt: string; partySize: number; notes?: string; tableId?: string; excludeReservationId?: string }) {
  const at = new Date(input.reservedAt);
  if (!Number.isFinite(at.getTime()) || !Number.isInteger(input.partySize) || input.partySize < 1) throw new Error("Invalid reservation time or party size.");
  const date = todayIsoDateInVenue(at);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  const ctx = await loadDayCapacityContext(date);
  const grill = resolveGrill({ partySize: input.partySize, reservedAt: at, status: "pending", notes: input.notes });
  const params = { dateIso: date, time, partySize: input.partySize, grill, reservations: ctx.reservations,
    occupiedTables: ctx.occupiedTables, durationMinutes: ctx.settings.reservationDurationMinutes,
    bufferMinutes: ctx.settings.reservationBufferMinutes, excludeReservationId: input.excludeReservationId };
  if (!input.tableId && evaluateReservationCapacity(params).availability === "full") throw new Error("No available table fits this reservation. Choose another time.");
  if (input.tableId) {
    const { data: table, error } = await createSupabaseAdmin().from("tables").select("label").eq("id", input.tableId).maybeSingle();
    const config = table && floorTableByLabel(table.label);
    if (error || !config || config.capacity < input.partySize || (grill === "yes" && !config.grill)
      || blockedTableLabels({ ...params, reservations: ctx.reservations.filter((r) =>
        r.tableLabel || r.secondaryTableLabel || r.tertiaryTableLabel) }).has(config.label)) {
      throw new Error("This table is occupied, reserved or unavailable for the requested seating period.");
    }
  }
}

export async function GET() {
  const auth = await readAuthSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await loadLiveTableAvailability(auth.businessId), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Availability unavailable. Ask staff." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const [auth, session] = await Promise.all([readAuthSession(), readStaffSession()]);
  if (!auth) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const db = createSupabaseAdmin();
  // The authenticated reception display already supports customer check-in.
  if (body.action === "check-in") {
    try {
      if (typeof body.reservationId !== "string" || typeof body.tableId !== "string") throw new Error("Select one table.");
      const { data: row, error } = await db.from("reservations").select("status,table_id,party_size,notes,wants_grill")
        .eq("id", body.reservationId).maybeSingle();
      if (error || !row) throw new Error("Reservation not found.");
      if (row.status === "checked_in" && row.table_id === body.tableId) return NextResponse.json({ ok: true });
      if (!["pending", "confirmed", "late"].includes(row.status)) throw new Error("This reservation cannot be checked in.");
      const { source } = await loadLiveTableAvailability(auth.businessId);
      // Virtual allocations guide availability; they must not lock a staff-selected empty table.
      const view = calculateTableAvailability({ ...source, reservations: source.reservations.filter((r) =>
        r.id !== body.reservationId && (r.tableLabel || r.secondaryTableLabel || r.tertiaryTableLabel)) });
      const table = view.tables.find((t) => t.id === body.tableId);
      const party = Number(body.actualPartySize ?? row.party_size);
      const grill = resolveGrill({ partySize: party, reservedAt: source.serverNow, status: row.status, notes: row.notes, wantsGrill: row.wants_grill });
      if (!table || table.status !== "available" || !Number.isInteger(party) || party < 1 || party > table.capacity || (grill === "yes" && !table.grill)) {
        throw new Error("This table is occupied or cannot accommodate this party. Select another available table.");
      }
      const result = await db.rpc("check_in_single_reservation", { p_reservation: body.reservationId, p_table: body.tableId,
        p_party: party, p_duration: source.durationMinutes, p_buffer: source.bufferMinutes });
      if (result.error) throw result.error;
      return NextResponse.json({ ok: true });
    } catch (error) {
      return NextResponse.json({ error: (error as { message?: string })?.message ?? "Could not check in. Refresh availability and retry." }, { status: 400 });
    }
  }
  if (!session || auth.businessId !== session.businessId) return NextResponse.json({ error: "Staff login required." }, { status: 401 });
  const { data: staff } = await db.from("staff").select("role").eq("id", session.staffId)
    .eq("business_id", auth.businessId).eq("active", true).maybeSingle();
  if (!staff || !["admin", "manager", "cashier", "server"].includes(staff.role)) return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  try {
    if (body.action === "unassign" && typeof body.reservationId === "string") {
      const { data, error } = await db.from("reservations").update({ table_id: null,
        secondary_table_id: null, tertiary_table_id: null, updated_at: new Date().toISOString() })
        .eq("id", body.reservationId).in("status", ["pending", "confirmed", "late"]).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Only reservations waiting to check in can be unassigned.");
    } else if (body.action === "validate") {
      await validateSeating({ reservedAt: String(body.reservedAt), partySize: Number(body.partySize),
        tableId: body.tableId || undefined, notes: body.notes, excludeReservationId: body.excludeReservationId });
    } else if (body.action === "settings") {
      if (!["admin", "manager"].includes(staff.role)) return NextResponse.json({ error: "Manager permission required." }, { status: 403 });
      const duration = Number(body.durationMinutes), buffer = Number(body.bufferMinutes);
      if (!Number.isInteger(duration) || duration < 60 || duration > 240 || !Number.isInteger(buffer) || buffer < 0 || buffer > 120) {
        return NextResponse.json({ error: "Dining duration: 60–240 minutes. Buffer: 0–120 minutes." }, { status: 400 });
      }
      const { data: existing, error: lookupError } = await db.from("settings").select("id")
        .eq("business_id", auth.businessId).maybeSingle();
      if (lookupError) throw lookupError;
      const payload = { reservation_duration_minutes: duration, reservation_buffer_minutes: buffer };
      const result = existing
        ? await db.from("settings").update(payload).eq("id", existing.id)
        : await db.from("settings").insert({ business_id: auth.businessId, ...payload });
      if (result.error) throw result.error;
    } else if (body.action === "block" && typeof body.tableId === "string" && typeof body.blocked === "boolean") {
      const { data, error } = await db.from("tables").update({ availability_blocked: body.blocked })
        .eq("id", body.tableId).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "Table not found." }, { status: 404 });
    } else return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as { message?: string })?.message ?? "Could not save availability settings. Apply supabase/patch-live-table-availability.sql and retry." }, { status: 400 });
  }
}
