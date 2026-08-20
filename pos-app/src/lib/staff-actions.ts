"use server";

import {
  canDeleteStaffMember,
  canManageStaff,
  parseAllowedNav,
} from "@/lib/staff-roles";
import type { NavId, StaffMember, StaffRole } from "@/lib/types";
import { hashPassword, verifyPassword } from "@/src/lib/auth/password";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";
import { mapStaffResponse } from "@/src/lib/supabase-data";

export interface StaffInput {
  name: string;
  username: string;
  /** Required when creating; omit or leave empty to keep existing password on edit. */
  password?: string;
  role: StaffRole;
  active: boolean;
  allowedNav: NavId[];
}

export interface StaffSelfProfileInput {
  currentPassword?: string;
  newPassword?: string;
  /** Admin only — change own login username. */
  newUsername?: string;
}

type StaffRow = {
  id: string;
  name: string;
  role: string;
  username?: string | null;
  active?: boolean | null;
  allowed_nav?: unknown;
  business_id?: string | null;
};

const STAFF_SELECT =
  "id, name, role, username, active, allowed_nav";

async function requireManagerContext() {
  const businessSession = await readAuthSession();
  if (!businessSession) {
    return { error: new Error("Business login required.") };
  }

  const staffSession = await readStaffSession();
  if (!staffSession || staffSession.businessId !== businessSession.businessId) {
    return { error: new Error("Staff login required.") };
  }

  const supabase = createSupabaseAdmin();
  const { data: actorRow, error } = await supabase
    .from("staff")
    .select(STAFF_SELECT)
    .eq("id", staffSession.staffId)
    .maybeSingle();

  if (error || !actorRow) {
    return { error: new Error("Staff session invalid.") };
  }

  const [actor] = mapStaffResponse([actorRow as StaffRow]);
  if (!actor || !canManageStaff(actor.role)) {
    return { error: new Error("Only admin or manager can manage staff.") };
  }

  return { businessSession, actor, supabase };
}

function staffRowPayload(businessId: string, input: StaffInput, passwordHash?: string, passwordSalt?: string) {
  const allowedNav = parseAllowedNav(input.allowedNav);
  const payload: Record<string, unknown> = {
    name: input.name.trim(),
    username: input.username.trim().toLowerCase(),
    role: input.role,
    active: input.active,
    allowed_nav: allowedNav ?? null,
    business_id: businessId,
    pin: null,
    require_pin_for_actions: false,
    require_switch_password: false,
  };
  if (passwordHash && passwordSalt) {
    payload.password_hash = passwordHash;
    payload.password_salt = passwordSalt;
  }
  return payload;
}

function validateStaffInput(input: StaffInput, isCreate: boolean) {
  if (!input.name.trim()) {
    return "Staff name is required.";
  }
  if (!input.username.trim()) {
    return "Username is required.";
  }
  if (!/^[a-z0-9._-]{2,32}$/i.test(input.username.trim())) {
    return "Username must be 2–32 characters (letters, numbers, . _ -).";
  }
  if (isCreate && !input.password?.trim()) {
    return "Password is required for new staff.";
  }
  if (input.password?.trim() && input.password.trim().length < 4) {
    return "Password must be at least 4 characters.";
  }
  if (input.allowedNav.length === 0) {
    return "Select at least one POS tab.";
  }
  return null;
}

export async function createStaff(input: StaffInput) {
  const ctx = await requireManagerContext();
  if ("error" in ctx && ctx.error) {
    return { data: null, error: ctx.error };
  }
  const { businessSession, supabase } = ctx;

  const validationError = validateStaffInput(input, true);
  if (validationError) {
    return { data: null, error: new Error(validationError) };
  }

  const { hash, salt } = hashPassword(input.password!.trim());
  const { data, error } = await supabase
    .from("staff")
    .insert(staffRowPayload(businessSession.businessId, input, hash, salt))
    .select(STAFF_SELECT)
    .single();

  if (error) return { data: null, error };
  const [member] = mapStaffResponse([data as StaffRow]);
  return { data: member ?? null, error: null };
}

export async function updateStaff(id: string, input: StaffInput) {
  const ctx = await requireManagerContext();
  if ("error" in ctx && ctx.error) {
    return { data: null, error: ctx.error };
  }
  const { businessSession, supabase } = ctx;

  const validationError = validateStaffInput(input, false);
  if (validationError) {
    return { data: null, error: new Error(validationError) };
  }

  let passwordHash: string | undefined;
  let passwordSalt: string | undefined;
  if (input.password?.trim()) {
    const hashed = hashPassword(input.password.trim());
    passwordHash = hashed.hash;
    passwordSalt = hashed.salt;
  }

  const { data, error } = await supabase
    .from("staff")
    .update(staffRowPayload(businessSession.businessId, input, passwordHash, passwordSalt))
    .eq("id", id)
    .eq("business_id", businessSession.businessId)
    .select(STAFF_SELECT)
    .single();

  if (error) return { data: null, error };
  const [member] = mapStaffResponse([data as StaffRow]);
  return { data: member ?? null, error: null };
}

export async function updateStaffSelfProfile(
  actorId: string,
  member: StaffMember,
  input: StaffSelfProfileInput,
) {
  if (member.id !== actorId) {
    return {
      data: null,
      error: new Error("You can only update your own staff profile."),
    };
  }

  const businessSession = await readAuthSession();
  if (!businessSession) {
    return { data: null, error: new Error("Business login required.") };
  }

  const supabase = createSupabaseAdmin();
  const updatePayload: Record<string, unknown> = {};

  if (input.newUsername !== undefined) {
    if (member.role !== "admin") {
      return { data: null, error: new Error("Only admin can change username.") };
    }
    const trimmed = input.newUsername.trim().toLowerCase();
    if (!trimmed) {
      return { data: null, error: new Error("Username is required.") };
    }
    if (!/^[a-z0-9._-]{2,32}$/i.test(trimmed)) {
      return { data: null, error: new Error("Username must be 2–32 characters (letters, numbers, . _ -).") };
    }
    updatePayload.username = trimmed;
  }

  if (input.newPassword?.trim()) {
    if (!input.currentPassword?.trim()) {
      return { data: null, error: new Error("Enter your current password.") };
    }
    if (input.newPassword.trim().length < 4) {
      return { data: null, error: new Error("New password must be at least 4 characters.") };
    }

    const { data: creds, error: credsError } = await supabase
      .from("staff")
      .select("password_hash, password_salt")
      .eq("id", member.id)
      .eq("business_id", businessSession.businessId)
      .maybeSingle();

    if (credsError || !creds?.password_hash || !creds.password_salt) {
      return { data: null, error: new Error("Password is not set yet. Ask a manager.") };
    }

    if (!verifyPassword(input.currentPassword.trim(), creds.password_hash, creds.password_salt)) {
      return { data: null, error: new Error("Current password is incorrect.") };
    }

    const { hash, salt } = hashPassword(input.newPassword.trim());
    updatePayload.password_hash = hash;
    updatePayload.password_salt = salt;
  }

  if (Object.keys(updatePayload).length === 0) {
    return { data: member, error: null };
  }

  const { data, error } = await supabase
    .from("staff")
    .update(updatePayload)
    .eq("id", member.id)
    .eq("business_id", businessSession.businessId)
    .select(STAFF_SELECT)
    .single();

  if (error) return { data: null, error };
  const [updated] = mapStaffResponse([data as StaffRow]);
  return { data: updated ?? null, error: null };
}

export async function deleteStaff(
  id: string,
  context?: {
    actor?: StaffMember | null;
    roster?: StaffMember[];
  },
) {
  const ctx = await requireManagerContext();
  if ("error" in ctx && ctx.error) {
    return { error: ctx.error };
  }
  const { businessSession, supabase } = ctx;

  const target = context?.roster?.find((member) => member.id === id);
  if (target && context?.roster) {
    if (!canDeleteStaffMember(target, context.actor, context.roster)) {
      return {
        error: new Error(
          target.id === context.actor?.id
            ? "Cannot delete your own staff profile while logged in."
            : "Cannot delete the last active admin account.",
        ),
      };
    }
  }

  return supabase.from("staff").delete().eq("id", id).eq("business_id", businessSession.businessId);
}
