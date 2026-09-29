import { createSupabaseAdmin } from "@/src/lib/supabase-admin";

const HOLD_TTL_MS = 3 * 60 * 1000; // ~3 minutes

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

export async function listActiveHoldsForSlot(input: {
  dateIso: string;
  time: string;
  excludeToken?: string | null;
}): Promise<Array<{ partySize: number; wantsGrill: "yes" | "no" | "undecided" | null }>> {
  try {
    await purgeExpiredReservationHolds();
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("reservation_holds")
      .select("party_size, hold_token, wants_grill")
      .eq("date_iso", input.dateIso)
      .eq("time_slot", input.time)
      .gt("expires_at", new Date().toISOString());

    if (error || !data) return [];
    return data
      .filter((row) => !(input.excludeToken && row.hold_token === input.excludeToken))
      .map((row) => ({
        partySize: Math.max(1, Number(row.party_size) || 1),
        wantsGrill:
          row.wants_grill === "yes" || row.wants_grill === "no" || row.wants_grill === "undecided"
            ? row.wants_grill
            : null,
      }));
  } catch {
    return [];
  }
}

export async function sumActiveHoldsForSlot(input: {
  dateIso: string;
  time: string;
  excludeToken?: string | null;
}): Promise<number> {
  const parties = await listActiveHoldsForSlot(input);
  return parties.reduce((sum, row) => sum + row.partySize, 0);
}
