import type { NavId, StaffMember, StaffRole } from "@/lib/types";
import { canDeleteStaffMember, defaultNavTabsForRole, parseAllowedNav } from "@/lib/staff-roles";
import { supabase } from "@/src/lib/supabase";

export interface StaffInput {
  name: string;
  role: StaffRole;
  pin: string;
  active: boolean;
  /** Custom tab permissions; empty = role defaults */
  allowedNav: NavId[];
  requirePinForActions: boolean;
  requireSwitchPassword: boolean;
}

export interface StaffSelfProfileInput {
  pin: string;
  requirePinForActions: boolean;
  requireSwitchPassword: boolean;
}

function staffRowPayload(input: StaffInput) {
  const allowedNav = parseAllowedNav(input.allowedNav);
  return {
    name: input.name.trim(),
    role: input.role,
    pin: input.pin.trim() || null,
    active: input.active,
    allowed_nav: allowedNav ?? null,
    require_pin_for_actions: input.requirePinForActions,
    require_switch_password: input.requireSwitchPassword,
  };
}

export async function createStaff(input: StaffInput) {
  return supabase.from("staff").insert(staffRowPayload(input)).select("*").single();
}

export async function updateStaff(id: string, input: StaffInput) {
  return supabase.from("staff").update(staffRowPayload(input)).eq("id", id).select("*").single();
}

/** Self-service: only the logged-in member may update their PIN / security toggles. */
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

  const allowedNav =
    member.allowedNav?.length ? member.allowedNav : defaultNavTabsForRole(member.role);

  return updateStaff(member.id, {
    name: member.name,
    role: member.role,
    pin: input.pin,
    active: member.active,
    allowedNav,
    requirePinForActions: input.requirePinForActions,
    requireSwitchPassword: input.requireSwitchPassword,
  });
}

export async function deleteStaff(
  id: string,
  context?: {
    actor?: StaffMember | null;
    roster?: StaffMember[];
  },
) {
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

  return supabase.from("staff").delete().eq("id", id);
}
