"use server";

import { ALL_NAV_TABS, normalizeStaffRole } from "@/lib/staff-roles";
import type { StaffMember } from "@/lib/types";
import { readAuthSession } from "@/src/lib/auth/session";
import {
  clearStaffSession,
  readStaffSession,
  writeStaffSession,
  type StaffSessionPayload,
} from "@/src/lib/auth/staff-session";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";
import { mapStaffResponse } from "@/src/lib/supabase-data";

type StaffRow = {
  id: string;
  name: string;
  role: string;
  username?: string | null;
  active?: boolean | null;
  allowed_nav?: unknown;
  business_id?: string | null;
};

const STAFF_SELECT = "id, name, role, username, active, allowed_nav, business_id";

const UNWANTED_STAFF_NAMES = new Set(["andy", "kien", "kiên"]);

function toStaffSession(row: StaffRow, businessId: string): StaffSessionPayload {
  return {
    staffId: row.id,
    businessId,
    username: row.username ?? "",
    staffName: row.name,
    staffRole: normalizeStaffRole(row.role),
  };
}

async function requireBusinessSession() {
  const session = await readAuthSession();
  if (!session) return null;
  return session;
}

export async function getStaffSessionAction(): Promise<StaffSessionPayload | null> {
  const businessSession = await requireBusinessSession();
  if (!businessSession) return null;

  const staffSession = await readStaffSession();
  if (!staffSession) return null;
  if (staffSession.businessId !== businessSession.businessId) {
    await clearStaffSession();
    return null;
  }
  return staffSession;
}

export async function getCurrentStaffMemberAction(): Promise<StaffMember | null> {
  const staffSession = await getStaffSessionAction();
  if (!staffSession) return null;

  const supabase = createSupabaseAdmin();
  const selectFields = STAFF_SELECT;

  let { data, error } = await supabase
    .from("staff")
    .select(selectFields)
    .eq("id", staffSession.staffId)
    .eq("business_id", staffSession.businessId)
    .maybeSingle();

  if ((!data || error) && staffSession.staffId) {
    const fallback = await supabase
      .from("staff")
      .select(selectFields)
      .eq("id", staffSession.staffId)
      .maybeSingle();
    data = fallback.data;
    error = fallback.error;

    if (data && !(data as StaffRow).business_id) {
      await supabase
        .from("staff")
        .update({ business_id: staffSession.businessId })
        .eq("id", staffSession.staffId);
    }
  }

  if (error || !data) return null;
  const [member] = mapStaffResponse([data as StaffRow]);
  return member ?? null;
}

export async function listStaffAction(): Promise<{ data: StaffMember[]; error?: string }> {
  const businessSession = await requireBusinessSession();
  if (!businessSession) {
    return { data: [], error: "unauthorized" };
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("staff")
    .select(STAFF_SELECT)
    .eq("business_id", businessSession.businessId)
    .order("name");

  if (error) {
    return { data: [], error: error.message };
  }

  if ((data ?? []).length === 0) {
    const { data: legacy, error: legacyError } = await supabase
      .from("staff")
      .select(STAFF_SELECT)
      .is("business_id", null)
      .order("name");

    if (legacyError) return { data: [], error: legacyError.message };

    if (legacy && legacy.length > 0) {
      await supabase
        .from("staff")
        .update({ business_id: businessSession.businessId })
        .is("business_id", null);
    }

    return { data: mapStaffResponse(legacy as StaffRow[]) };
  }

  return { data: mapStaffResponse(data as StaffRow[]) };
}

async function clearStaffForeignKeys(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  staffId: string,
) {
  await supabase.from("sales").update({ staff_id: null }).eq("staff_id", staffId);
  await supabase.from("order_items").update({ staff_id: null }).eq("staff_id", staffId);
  await supabase.from("action_logs").update({ staff_id: null }).eq("staff_id", staffId);
  await supabase.from("reservations").update({ staff_id: null }).eq("staff_id", staffId);
}

/** Remove Andy/Kiên, ensure Adam admin exists, set delete passcode default to 8888. */
export async function ensureStaffRosterCleanup() {
  const businessSession = await requireBusinessSession();
  if (!businessSession) return;

  const supabase = createSupabaseAdmin();
  const businessId = businessSession.businessId;

  await supabase.from("staff").update({ business_id: businessId }).is("business_id", null);

  const { data: roster } = await supabase
    .from("staff")
    .select("id, name, username, role, active")
    .eq("business_id", businessId);

  for (const row of roster ?? []) {
    const nameKey = String(row.name ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFC");
    const usernameKey = String(row.username ?? "")
      .trim()
      .toLowerCase();
    if (UNWANTED_STAFF_NAMES.has(nameKey) || UNWANTED_STAFF_NAMES.has(usernameKey)) {
      await clearStaffForeignKeys(supabase, row.id);
      await supabase.from("staff").delete().eq("id", row.id);
    }
  }

  const { data: adamRows } = await supabase
    .from("staff")
    .select("id")
    .eq("business_id", businessId)
    .ilike("name", "adam");

  if (!adamRows?.length) {
    await supabase.from("staff").insert({
      name: "Adam",
      role: "admin",
      username: "adam",
      active: true,
      business_id: businessId,
      allowed_nav: ALL_NAV_TABS,
      pin: null,
      require_pin_for_actions: false,
      require_switch_password: false,
      password_hash: null,
      password_salt: null,
    });
  } else {
    await supabase
      .from("staff")
      .update({
        role: "admin",
        active: true,
        username: "adam",
        allowed_nav: ALL_NAV_TABS,
        require_pin_for_actions: false,
        require_switch_password: false,
      })
      .eq("id", adamRows[0].id);
  }

  const { data: settingsRows } = await supabase
    .from("settings")
    .select("id, business_id, admin_deletion_password")
    .or(`business_id.eq.${businessId},id.eq.1`);

  for (const row of settingsRows ?? []) {
    const current = String(row.admin_deletion_password ?? "").trim();
    if (!current || current === "1234") {
      await supabase
        .from("settings")
        .update({ admin_deletion_password: "8888" })
        .eq("id", row.id);
    }
  }
}

/** Select a staff member for this device — no password required. */
export async function selectStaffAction(staffId: string) {
  const businessSession = await requireBusinessSession();
  if (!businessSession) {
    return { ok: false as const, error: "businessSessionRequired" };
  }

  await ensureStaffRosterCleanup();

  const supabase = createSupabaseAdmin();
  let { data, error } = await supabase
    .from("staff")
    .select("*")
    .eq("id", staffId)
    .eq("business_id", businessSession.businessId)
    .maybeSingle();

  if (!data) {
    const fallback = await supabase.from("staff").select("*").eq("id", staffId).maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }

  if (error || !data) {
    return { ok: false as const, error: "invalidCredentials" };
  }

  const row = data as StaffRow;
  if (!row.active) {
    return { ok: false as const, error: "invalidCredentials" };
  }

  const session = toStaffSession(row, businessSession.businessId);
  await supabase
    .from("staff")
    .update({ business_id: businessSession.businessId })
    .eq("id", row.id);
  await writeStaffSession(session);
  const [member] = mapStaffResponse([row]);
  return { ok: true as const, session, member: member ?? null };
}

/** @deprecated Use selectStaffAction — kept for older imports. */
export async function staffLoginAction(username: string, _password?: string) {
  const businessSession = await requireBusinessSession();
  if (!businessSession) {
    return { ok: false as const, error: "businessSessionRequired" };
  }

  await ensureStaffRosterCleanup();
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) {
    return { ok: false as const, error: "invalidCredentials" };
  }

  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from("staff")
    .select("*")
    .eq("business_id", businessSession.businessId)
    .or(`username.ilike.${trimmed},name.ilike.${trimmed}`)
    .maybeSingle();

  if (!data?.id) {
    return { ok: false as const, error: "invalidCredentials" };
  }

  return selectStaffAction(data.id as string);
}

export async function staffLogoutAction() {
  await clearStaffSession();
  return { ok: true as const };
}

export async function switchStaffAction(staffId: string, _password?: string) {
  return selectStaffAction(staffId);
}

/** @deprecated Staff passwords removed. */
export async function changeStaffPasswordAction() {
  return { ok: false as const, error: "unsupported" };
}

/** @deprecated Use ensureStaffRosterCleanup. */
export async function ensureDefaultStaffCredentials() {
  return ensureStaffRosterCleanup();
}
