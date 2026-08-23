"use server";

import {
  canDeleteStaffMember,
  parseAllowedNav,
} from "@/lib/staff-roles";
import type { NavId, StaffMember, StaffRole } from "@/lib/types";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";
import { mapStaffResponse } from "@/src/lib/supabase-data";

export interface StaffInput {
  name: string;
  role: StaffRole;
  active: boolean;
  allowedNav: NavId[];
  /** Optional legacy field — ignored when creating/updating. */
  username?: string;
  password?: string;
}

export interface StaffSelfProfileInput {
  /** Unused — passwords removed. */
  currentPassword?: string;
  newPassword?: string;
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

const STAFF_SELECT = "id, name, role, username, active, allowed_nav";

async function requireAdminContext() {
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
  if (!actor || actor.role !== "admin") {
    return { error: new Error("Only admin can manage staff.") };
  }

  return { businessSession, actor, supabase };
}

function usernameFromName(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .normalize("NFC")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 24) || "staff"
  );
}

function staffRowPayload(businessId: string, input: StaffInput) {
  const allowedNav = parseAllowedNav(input.allowedNav);
  return {
    name: input.name.trim(),
    username: usernameFromName(input.name),
    role: input.role,
    active: input.active,
    allowed_nav: allowedNav ?? null,
    business_id: businessId,
    pin: null,
    require_pin_for_actions: false,
    require_switch_password: false,
    password_hash: null,
    password_salt: null,
  };
}

function validateStaffInput(input: StaffInput) {
  if (!input.name.trim()) {
    return "Staff name is required.";
  }
  if (input.allowedNav.length === 0) {
    return "Select at least one POS tab.";
  }
  return null;
}

export async function createStaff(input: StaffInput) {
  const ctx = await requireAdminContext();
  if ("error" in ctx && ctx.error) {
    return { data: null, error: ctx.error };
  }
  const { businessSession, supabase } = ctx;

  const validationError = validateStaffInput(input);
  if (validationError) {
    return { data: null, error: new Error(validationError) };
  }

  const { data, error } = await supabase
    .from("staff")
    .insert(staffRowPayload(businessSession.businessId, input))
    .select(STAFF_SELECT)
    .single();

  if (error) return { data: null, error };
  const [member] = mapStaffResponse([data as StaffRow]);
  return { data: member ?? null, error: null };
}

export async function updateStaff(id: string, input: StaffInput) {
  const ctx = await requireAdminContext();
  if ("error" in ctx && ctx.error) {
    return { data: null, error: ctx.error };
  }
  const { businessSession, supabase } = ctx;

  const validationError = validateStaffInput(input);
  if (validationError) {
    return { data: null, error: new Error(validationError) };
  }

  const { data, error } = await supabase
    .from("staff")
    .update(staffRowPayload(businessSession.businessId, input))
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
  _input: StaffSelfProfileInput,
) {
  if (member.id !== actorId) {
    return {
      data: null,
      error: new Error("You can only update your own staff profile."),
    };
  }

  // Staff passwords / usernames are no longer editable from the self profile.
  return { data: member, error: null };
}

export async function deleteStaff(
  id: string,
  context?: {
    actor?: StaffMember | null;
    roster?: StaffMember[];
  },
) {
  const ctx = await requireAdminContext();
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

  await supabase.from("sales").update({ staff_id: null }).eq("staff_id", id);
  await supabase.from("order_items").update({ staff_id: null }).eq("staff_id", id);
  await supabase.from("action_logs").update({ staff_id: null }).eq("staff_id", id);
  await supabase.from("reservations").update({ staff_id: null }).eq("staff_id", id);

  return supabase.from("staff").delete().eq("id", id).eq("business_id", businessSession.businessId);
}
