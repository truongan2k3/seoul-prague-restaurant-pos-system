import { createSupabaseAdmin } from "@/src/lib/supabase-admin";
import { venueWallTimeToUtc } from "@/lib/venue-timezone";
import type { CapacityReservationInput } from "@/lib/reservation-capacity-engine";

const HOLD_TTL_MS = 3 * 60 * 1000; // ~3 minutes

/** One batched read per date, not a query + expired-hold delete for every time option. */
export async function loadActiveReservationHolds(dateIso: string, excludeToken?: string | null): Promise<CapacityReservationInput[]> {
  const db = createSupabaseAdmin();
  const rows: { hold_token: string; time_slot: string; party_size: number; wants_grill: string | null; created_at: string }[] = [];
  const now = new Date().toISOString();
  for (let offset = 0;; offset += 200) {
    const { data, error } = await db.from("reservation_holds").select("hold_token,time_slot,party_size,wants_grill,created_at")
      .eq("date_iso", dateIso).gt("expires_at", now).order("created_at").order("hold_token").range(offset, offset + 199);
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") return [];
      throw new Error(error.message);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < 200) break;
  }
  const ownIndex = excludeToken ? rows.findIndex((row) => row.hold_token === excludeToken) : -1;
  // Earlier holds have priority. Later submissions must not make the first guest lose their own hold.
  return (ownIndex >= 0 ? rows.slice(0, ownIndex) : rows).filter((row) => row.hold_token !== excludeToken).map<CapacityReservationInput>((row) => ({
    id: `hold:${row.hold_token}`, partySize: Number(row.party_size), reservedAt: venueWallTimeToUtc(dateIso, row.time_slot), status: "pending",
    wantsGrill: row.wants_grill === "yes" || row.wants_grill === "no" ? row.wants_grill : null,
  }));
}

function randomToken(): string {
  return `hold_${crypto.randomUUID().replace(/-/g, "")}`;
}

/** Drop expired holds (best-effort). */
export async function purgeExpiredReservationHolds(): Promise<void> {
  try {
    const admin = createSupabaseAdmin();
    await admin.from("reservation_holds").delete().lt("expires_at", new Date().toISOString());
  } catch {
    /* table may not exist yet */
  }
}

export async function createReservationHold(input: {
  dateIso: string;
  time: string;
  partySize: number;
  wantsGrill?: string | null;
}): Promise<{ token: string; expiresAt: string } | { error: string }> {
  await purgeExpiredReservationHolds();
  const admin = createSupabaseAdmin();
  const token = randomToken();
  const expiresAt = new Date(Date.now() + HOLD_TTL_MS).toISOString();

  const { error } = await admin.from("reservation_holds").insert({
    hold_token: token,
    date_iso: input.dateIso,
    time_slot: input.time,
    party_size: Math.max(1, input.partySize),
    wants_grill: input.wantsGrill ?? null,
    expires_at: expiresAt,
  });

  if (error) {
    // Backward compatible if migration not applied yet.
    if (/relation .*reservation_holds.* does not exist/i.test(error.message)) {
      return { token: `legacy_${token}`, expiresAt };
    }
    return { error: error.message };
  }

  return { token, expiresAt };
}

export async function releaseReservationHold(token: string | null | undefined): Promise<void> {
  if (!token || token.startsWith("legacy_")) return;
  try {
    const admin = createSupabaseAdmin();
    await admin.from("reservation_holds").delete().eq("hold_token", token);
  } catch {
    /* ignore */
  }
}

export async function sumActiveHoldsForSlot(input: {
  dateIso: string;
  time: string;
  excludeToken?: string | null;
}): Promise<number> {
  try {
    await purgeExpiredReservationHolds();
    const admin = createSupabaseAdmin();
    let query = admin
      .from("reservation_holds")
      .select("party_size, hold_token")
      .eq("date_iso", input.dateIso)
      .eq("time_slot", input.time)
      .gt("expires_at", new Date().toISOString());

    const { data, error } = await query;
    if (error || !data) return 0;
    return data.reduce((sum, row) => {
      if (input.excludeToken && row.hold_token === input.excludeToken) return sum;
      return sum + (Number(row.party_size) || 0);
    }, 0);
  } catch {
    return 0;
  }
}
