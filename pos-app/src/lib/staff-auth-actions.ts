"use server";

import { canManageStaff, normalizeStaffRole, roleCanApproveWithPin } from "@/lib/staff-roles";
import type { StaffMember, StaffRole } from "@/lib/types";
import { hashPassword, verifyPassword } from "@/src/lib/auth/password";
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
  password_hash?: string | null;
  password_salt?: string | null;
  pin?: string | null;
  active?: boolean | null;
  allowed_nav?: unknown;
  require_pin_for_actions?: boolean | null;
  require_switch_password?: boolean | null;
  business_id?: string | null;
};

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
  const { data, error } = await supabase
    .from("staff")
    .select(
      "id, name, role, username, active, allowed_nav, require_pin_for_actions, require_switch_password",
    )
    .eq("id", staffSession.staffId)
    .eq("business_id", staffSession.businessId)
    .maybeSingle();

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
    .select(
      "id, name, role, username, active, allowed_nav, require_pin_for_actions, require_switch_password",
    )
    .eq("business_id", businessSession.businessId)
    .order("name");

  if (error) return { data: [], error: error.message };
  return { data: mapStaffResponse(data as StaffRow[]) };
}

async function findStaffForLogin(businessId: string, username: string) {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("staff")
    .select("*")
    .eq("business_id", businessId)
    .ilike("username", username.trim().toLowerCase())
    .maybeSingle();

  if (error || !data) return null;
  return data as StaffRow;
}

export async function staffLoginAction(username: string, password: string) {
  const businessSession = await requireBusinessSession();
  if (!businessSession) {
    return { ok: false as const, error: "businessSessionRequired" };
  }

  const trimmedUser = username.trim().toLowerCase();
  const trimmedPass = password;
  if (!trimmedUser || !trimmedPass) {
    return { ok: false as const, error: "invalidCredentials" };
  }

  const row = await findStaffForLogin(businessSession.businessId, trimmedUser);
  if (!row || !row.active) {
    return { ok: false as const, error: "invalidCredentials" };
  }
  if (!row.password_hash || !row.password_salt) {
    return { ok: false as const, error: "passwordNotSet" };
  }
  if (!verifyPassword(trimmedPass, row.password_hash, row.password_salt)) {
    return { ok: false as const, error: "invalidCredentials" };
  }

  const session = toStaffSession(row, businessSession.businessId);
  await writeStaffSession(session);
  const [member] = mapStaffResponse([row]);
  return { ok: true as const, session, member: member ?? null };
}

export async function staffLogoutAction() {
  await clearStaffSession();
  return { ok: true as const };
}

export async function switchStaffAction(staffId: string, password: string) {
  const businessSession = await requireBusinessSession();
  if (!businessSession) {
    return { ok: false as const, error: "businessSessionRequired" };
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("staff")
    .select("*")
    .eq("id", staffId)
    .eq("business_id", businessSession.businessId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false as const, error: "invalidCredentials" };
  }

  const row = data as StaffRow;
  if (!row.active) {
    return { ok: false as const, error: "invalidCredentials" };
  }
  if (!row.password_hash || !row.password_salt) {
    return { ok: false as const, error: "passwordNotSet" };
  }
  if (!verifyPassword(password, row.password_hash, row.password_salt)) {
    return { ok: false as const, error: "invalidCredentials" };
  }

  const session = toStaffSession(row, businessSession.businessId);
  await writeStaffSession(session);
  const [member] = mapStaffResponse([row]);
  return { ok: true as const, member: member ?? null };
}

export async function changeStaffPasswordAction(currentPassword: string, newPassword: string) {
  const staffSession = await getStaffSessionAction();
  if (!staffSession) {
    return { ok: false as const, error: "unauthorized" };
  }

  const trimmedCurrent = currentPassword.trim();
  const trimmedNew = newPassword.trim();
  if (!trimmedCurrent || !trimmedNew || trimmedNew.length < 4) {
    return { ok: false as const, error: "invalidPassword" };
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("staff")
    .select("password_hash, password_salt")
    .eq("id", staffSession.staffId)
    .eq("business_id", staffSession.businessId)
    .maybeSingle();

  if (error || !data?.password_hash || !data.password_salt) {
    return { ok: false as const, error: "passwordNotSet" };
  }

  if (!verifyPassword(trimmedCurrent, data.password_hash, data.password_salt)) {
    return { ok: false as const, error: "invalidCredentials" };
  }

  const { hash, salt } = hashPassword(trimmedNew);
  const { error: updateError } = await supabase
    .from("staff")
    .update({ password_hash: hash, password_salt: salt })
    .eq("id", staffSession.staffId);

  if (updateError) {
    return { ok: false as const, error: updateError.message };
  }

  return { ok: true as const };
}

export async function verifyManagerPinAction(pin: string): Promise<boolean> {
  const businessSession = await requireBusinessSession();
  if (!businessSession || !pin.trim()) return false;

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("staff")
    .select("role, pin, active")
    .eq("business_id", businessSession.businessId)
    .eq("active", true);

  if (error || !data) return false;

  return (data as { role: string; pin?: string | null; active?: boolean }[]).some(
    (member) =>
      roleCanApproveWithPin(normalizeStaffRole(member.role) as StaffRole) &&
      member.pin === pin.trim(),
  );
}

export async function ensureDefaultStaffCredentials() {
  const businessSession = await requireBusinessSession();
  if (!businessSession) return;

  const supabase = createSupabaseAdmin();

  await supabase
    .from("staff")
    .update({ business_id: businessSession.businessId })
    .is("business_id", null);

  const { data: staffWithLogin } = await supabase
    .from("staff")
    .select("id")
    .eq("business_id", businessSession.businessId)
    .not("password_hash", "is", null)
    .limit(1);

  if (staffWithLogin && staffWithLogin.length > 0) return;

  const { data: adminStaff } = await supabase
    .from("staff")
    .select("id, name")
    .eq("business_id", businessSession.businessId)
    .in("role", ["admin", "cashier", "manager"])
    .order("name")
    .limit(1)
    .maybeSingle();

  if (!adminStaff) return;

  const slug =
    (adminStaff.name as string)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 16) || "staff";

  const { hash, salt } = hashPassword("1");
  await supabase
    .from("staff")
    .update({
      username: slug,
      password_hash: hash,
      password_salt: salt,
      business_id: businessSession.businessId,
    })
    .eq("id", adminStaff.id);
}
