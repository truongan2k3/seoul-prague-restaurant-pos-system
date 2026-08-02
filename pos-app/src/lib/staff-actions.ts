import type { StaffRole } from "@/lib/types";
import { supabase } from "@/src/lib/supabase";

export interface StaffInput {
  name: string;
  role: StaffRole;
  pin: string;
  active: boolean;
}

export async function createStaff(input: StaffInput) {
  return supabase
    .from("staff")
    .insert({
      name: input.name.trim(),
      role: input.role,
      pin: input.pin.trim() || null,
      active: input.active,
    })
    .select("*")
    .single();
}

export async function updateStaff(id: string, input: StaffInput) {
  return supabase
    .from("staff")
    .update({
      name: input.name.trim(),
      role: input.role,
      pin: input.pin.trim() || null,
      active: input.active,
    })
    .eq("id", id)
    .select("*")
    .single();
}

export async function deleteStaff(id: string) {
  return supabase.from("staff").delete().eq("id", id);
}
