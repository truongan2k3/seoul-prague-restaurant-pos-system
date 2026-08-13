import type { NavId, StaffRole } from "@/lib/types";
import { parseAllowedNav } from "@/lib/staff-roles";
import { supabase } from "@/src/lib/supabase";

export interface StaffInput {
  name: string;
  role: StaffRole;
  pin: string;
  active: boolean;
  /** Custom tab permissions; empty = role defaults */
  allowedNav: NavId[];
  requirePinForActions: boolean;
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
  };
}

export async function createStaff(input: StaffInput) {
  return supabase.from("staff").insert(staffRowPayload(input)).select("*").single();
}

export async function updateStaff(id: string, input: StaffInput) {
  return supabase.from("staff").update(staffRowPayload(input)).eq("id", id).select("*").single();
}

export async function deleteStaff(id: string) {
  return supabase.from("staff").delete().eq("id", id);
}
