import { NextResponse } from "next/server";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";
import { loadLiveTableAvailability } from "@/src/lib/table-availability-server";
import { checkInTableIssues, isExclusiveCheckInConflict } from "@/lib/reservation-check-in";
import { blockedTableLabels, evaluateReservationCapacity, resolveGrill } from "@/lib/reservation-capacity-engine";
import { floorTableByLabel, RESERVATION_FLOOR_TABLES } from "@/lib/reservation-floor-plan";
import { todayIsoDateInVenue } from "@/lib/venue-timezone";
import { loadDayCapacityContext } from "@/src/lib/reservation-guest-server";

async function validateSeating(input: { reservedAt: string; partySize: number; notes?: string; tableId?: string; tableIds?: string[]; excludeReservationId?: string }) {
  const at = new Date(input.reservedAt);
  if (!Number.isFinite(at.getTime()) || !Number.isInteger(input.partySize) || input.partySize < 1) throw new Error("Invalid reservation time or party size.");
  const date = todayIsoDateInVenue(at);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  const ctx = await loadDayCapacityContext(date);
  const grill = resolveGrill({ partySize: input.partySize, reservedAt: at, status: "pending", notes: input.notes });
  const params = { dateIso: date, time, partySize: input.partySize, grill, reservations: ctx.reservations,
    occupiedTables: ctx.occupiedTables, durationMinutes: ctx.settings.reservationDurationMinutes,
    bufferMinutes: ctx.settings.reservationBufferMinutes, excludeReservationId: input.excludeReservationId };
  const ids = input.tableIds ?? (input.tableId ? [input.tableId] : []);
  if (!Array.isArray(ids) || ids.length > 3 || ids.some((id) => typeof id !== "string" || !id.trim())
    || new Set(ids).size !== ids.length) throw new Error("Select up to three distinct tables.");
  // Staff can record a large group without assigning one undersized table.
  // Its separate tables and their combined capacity are checked at actual check-in.
  const needsMultipleTables = !RESERVATION_FLOOR_TABLES.some((table) => table.capacity >= input.partySize && (grill !== "yes" || table.grill));
  if (!ids.length && !needsMultipleTables && ctx.settings.reservationCapacityLimitsEnabled && evaluateReservationCapacity(params).availability === "full") throw new Error("No available table fits this reservation. Choose another time.");
  if (ids.length) {
    const { data: tables, error } = await createSupabaseAdmin().from("tables").select("id,label").in("id", ids);
    if (error) throw error;
    const configs = ids.map((id) => floorTableByLabel(tables?.find((table) => table.id === id)?.label ?? ""));
    if (configs.some((config) => !config)) throw new Error("Select configured dining tables.");
    const capacity = configs.reduce((total, config) => total + (config?.capacity ?? 0), 0);
    const blocked = blockedTableLabels({ ...params, reservations: ctx.reservations.filter((r) =>
      r.tableLabel || r.secondaryTableLabel || r.tertiaryTableLabel) });
    const warnings: string[] = [];
    if (capacity < input.partySize) warnings.push(`Selected tables seat ${capacity}; this reservation has ${input.partySize} guests.`);
    for (const config of configs) {
      if (!config) continue;
      if (grill === "yes" && !config.grill) warnings.push(`${config.label} has no BBQ grill, but this reservation requires BBQ.`);
      if (blocked.has(config.label)) warnings.push(`${config.label} is occupied, blocked or assigned to another reservation during this seating period.`);
    }
    if (warnings.length) throw Object.assign(new Error(warnings.join("\n")), { code: "TABLE_ASSIGNMENT_CONFLICT", overrideAllowed: true });
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
      const tableIds: string[] = Array.isArray(body.tableIds) ? body.tableIds : [body.tableId];
      if (typeof body.reservationId !== "string" || !tableIds.length || tableIds.length > 3
        || tableIds.some((id) => typeof id !== "string" || !id) || new Set(tableIds).size !== tableIds.length) throw new Error("Select one to three available tables.");
      const { data: row, error } = await db.from("reservations").select("status,table_id,secondary_table_id,tertiary_table_id,party_size,notes,wants_grill")
        .eq("id", body.reservationId).maybeSingle();
      if (error) throw error;
      if (!row) throw new Error("Reservation not found.");
      const linkedIds = [row.table_id, row.secondary_table_id, row.tertiary_table_id].filter(Boolean);
      if (row.status === "checked_in" && tableIds.length === linkedIds.length && tableIds.every((id, index) => id === linkedIds[index])) return NextResponse.json({ ok: true });
      if (!["pending", "confirmed", "late"].includes(row.status)) throw new Error("This reservation cannot be checked in.");
      const { source } = await loadLiveTableAvailability(auth.businessId);
      const party = Number(body.actualPartySize ?? row.party_size);
      const grill = resolveGrill({ partySize: party, reservedAt: source.serverNow, status: row.status, notes: row.notes, wantsGrill: row.wants_grill });
      const issues = tableIds.flatMap((id) => checkInTableIssues(source, id, body.reservationId, party, grill, tableIds));
      const issue = issues.find((item) => item && (isExclusiveCheckInConflict(item.code) || ["TABLE_NOT_CONFIGURED", "INVALID_PARTY_SIZE"].includes(item.code)))
        ?? issues.find(Boolean) ?? null;
      if (issue && isExclusiveCheckInConflict(issue.code)) {
        return NextResponse.json({ error: issue.message, code: issue.code, overrideAllowed: false }, { status: 409 });
      }
      const overrideAllowed = issue !== null && !["TABLE_NOT_CONFIGURED", "INVALID_PARTY_SIZE"].includes(issue.code);
      const warningReason = [...new Set(issues.map((item) => item.message))].join("\n");
      if (issue && (body.override !== true || !overrideAllowed)) return NextResponse.json({ error: warningReason, code: issue.code, overrideAllowed }, { status: 409 });
      if (tableIds.length > 1) {
        const result = await db.rpc("check_in_reservation_tables", { p_reservation: body.reservationId, p_tables: tableIds,
          p_party: party, p_business: auth.businessId, p_staff: session?.businessId === auth.businessId ? session.staffId : null,
          p_override: body.override === true, p_reason: String(warningReason || body.reason || "Reception check-in").slice(0, 2000) });
        if (result.error?.code === "PGRST202" || result.error?.code === "42883") return NextResponse.json({
          error: "Run supabase/patch-reservation-table-referral-scope.sql to enable separate-table check-in.", code: "CHECK_IN_SETUP_REQUIRED" }, { status: 503 });
        if (result.error) throw result.error;
        return NextResponse.json({ ok: true });
      }
      body.tableId = tableIds[0];
      if (body.override === true) {
        // Reception devices can confirm seating warnings without a staff login.
        // A matching staff session is optional audit metadata, not a permission gate.
        if (!Number.isInteger(party) || party < 1) throw new Error("Enter a valid number of guests.");
        if (issue && !overrideAllowed) return NextResponse.json({ error: issue.message, code: issue.code }, { status: 409 });
        const result = await db.rpc("override_reservation_check_in", { p_reservation: body.reservationId, p_table: body.tableId,
          p_party: party, p_staff: session?.businessId === auth.businessId ? session.staffId : null, p_business: auth.businessId,
          p_reason: String(warningReason || body.reason || "Reception confirmed check-in despite seating warning.").slice(0, 2000) });
        if (result.error?.code === "PGRST202" || result.error?.code === "42883") {
          return NextResponse.json({ error: "Apply the latest supabase/patch-reservation-assignment-override.sql to enable reception check-in confirmations.", code: "CHECK_IN_OVERRIDE_SETUP_REQUIRED" }, { status: 503 });
        }
        if (result.error && /Unauthorized staff/i.test(result.error.message)) return NextResponse.json({
          error: "Apply the latest supabase/patch-reservation-assignment-override.sql to remove the old staff-login requirement for check-in.",
          code: "CHECK_IN_OVERRIDE_SETUP_REQUIRED",
        }, { status: 503 });
        if (result.error) throw result.error;
        return NextResponse.json({ ok: true });
      }
      if (issue) return NextResponse.json({ error: issue.message, code: issue.code, overrideAllowed }, { status: 409 });
      const result = await db.rpc("check_in_single_reservation", { p_reservation: body.reservationId, p_table: body.tableId,
        p_party: party, p_duration: source.durationMinutes, p_buffer: source.bufferMinutes });
      if (result.error) throw result.error;
      return NextResponse.json({ ok: true });
    } catch (error) {
      const failure = error as { message?: string; code?: string };
      if (/Server authorization required|permission denied for function/i.test(failure.message ?? "")) {
        return NextResponse.json({ error: "The server cannot authorize the check-in database function. Check the Supabase service role configuration. This is a server authorization error, not an occupied table.", code: "CHECK_IN_SERVER_AUTH_ERROR" }, { status: 503 });
      }
      if (failure.code === "PGRST202" || failure.code === "42883") {
        return NextResponse.json({ error: "The check-in database function is missing or outdated. Apply patch-live-table-availability.sql in Supabase. This is a database setup error, not an occupied table.", code: "CHECK_IN_SETUP_REQUIRED" }, { status: 503 });
      }
      if (failure.code === "42703" || failure.code === "PGRST204") {
        return NextResponse.json({ error: `Reservation database schema is outdated: ${failure.message}`, code: "CHECK_IN_SCHEMA_ERROR" }, { status: 503 });
      }
      if (failure.code === "P0001" && /Table is occupied|Table already has a checked-in reservation/i.test(failure.message ?? "")) {
        return NextResponse.json({ error: "This table is occupied or already checked in. Complete the current visit or select another empty table.",
          code: "TABLE_OCCUPIED", overrideAllowed: false }, { status: 409 });
      }
      const overrideAllowed = body.override !== true && failure.code === "P0001"
        && /Table is (unavailable|already reserved|reserved for another seating)/i.test(failure.message ?? "");
      return NextResponse.json({ error: failure.message ?? "Could not check in. Refresh availability and retry.",
        code: failure.code ?? "CHECK_IN_FAILED", overrideAllowed }, { status: overrideAllowed ? 409 : 400 });
    }
  }
  if (!session || auth.businessId !== session.businessId) return NextResponse.json({ error: "Staff login required." }, { status: 401 });
  const { data: staff } = await db.from("staff").select("role").eq("id", session.staffId)
    .eq("business_id", auth.businessId).eq("active", true).maybeSingle();
  if (!staff || !["admin", "manager", "cashier", "server"].includes(staff.role)) return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  try {
    if (body.action === "assign-override" && typeof body.reservationId === "string") {
      const ids: string[] = body.tableIds ?? [body.tableId];
      if (!Array.isArray(ids) || !ids.length || ids.length > 3 || ids.some((id) => typeof id !== "string" || !id.trim())
        || new Set(ids).size !== ids.length) throw new Error("Select one to three distinct tables.");
      const { data: tables, error: tableError } = await db.from("tables").select("id,label").in("id", ids);
      if (tableError) throw tableError;
      if (!tables || tables.length !== ids.length || tables.some((table) => !floorTableByLabel(table.label))) throw new Error("Select configured dining tables.");
      const args = { p_reservation: body.reservationId, p_staff: session.staffId, p_business: auth.businessId,
        p_reason: String(body.reason ?? "Staff confirmed assignment despite availability warning.").slice(0, 2000) };
      const result = ids.length === 1
        ? await db.rpc("override_reservation_table_assignment", { ...args, p_table: ids[0] })
        : await db.rpc("override_reservation_table_assignments", { ...args, p_tables: ids });
      if (result.error?.code === "PGRST202" || result.error?.code === "42883") {
        return NextResponse.json({ error: `Apply supabase/${ids.length > 1 ? "patch-reservation-multi-table-assignment.sql" : "patch-reservation-assignment-override.sql"} in Supabase to enable staff assignment overrides.`, code: "ASSIGNMENT_OVERRIDE_SETUP_REQUIRED" }, { status: 503 });
      }
      if (result.error) throw result.error;
    } else if (body.action === "unassign" && typeof body.reservationId === "string") {
      const { data, error } = await db.from("reservations").update({ table_id: null,
        secondary_table_id: null, tertiary_table_id: null, staff_override_capacity: false, updated_at: new Date().toISOString() })
        .eq("id", body.reservationId).in("status", ["pending", "confirmed", "late"]).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Only reservations waiting to check in can be unassigned.");
    } else if (body.action === "validate") {
      await validateSeating({ reservedAt: String(body.reservedAt), partySize: Number(body.partySize),
        tableId: body.tableId || undefined, tableIds: body.tableIds, notes: body.notes, excludeReservationId: body.excludeReservationId });
    } else if (body.action === "booking-limits") {
      if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "Select whether booking limits are enabled." }, { status: 400 });
      const { data, error } = await db.from("settings")
        .update({ reservation_capacity_limits_enabled: body.enabled })
        .eq("business_id", auth.businessId).select("id").maybeSingle();
      if (error) {
        if (/reservation_capacity_limits_enabled/i.test(error.message)) throw new Error("Run supabase/patch-reservation-booking-limits.sql in Supabase to enable this setting.");
        throw error;
      }
      if (!data) throw new Error("Save POS settings once before changing booking limits.");
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
    const failure = error as { message?: string; code?: string; overrideAllowed?: boolean };
    const overrideAllowed = body.action === "validate" && failure.overrideAllowed === true;
    return NextResponse.json({ error: failure.message ?? "Could not save availability settings. Apply supabase/patch-live-table-availability.sql and retry.",
      code: failure.code, overrideAllowed }, { status: overrideAllowed ? 409 : 400 });
  }
}
