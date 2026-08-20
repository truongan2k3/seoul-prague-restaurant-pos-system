"use server";

import { getStaffSessionAction } from "@/src/lib/staff-auth-actions";

export type StaffActor = {
  staffId?: string;
  staffName: string;
};

/** Prefer logged-in staff session; fall back to client hint only when no session. */
export async function resolveStaffActor(hint?: {
  staffId?: string;
  staffName?: string;
}): Promise<StaffActor> {
  const session = await getStaffSessionAction();
  if (session) {
    const name = session.staffName?.trim() || session.username?.trim();
    if (name) {
      return { staffId: session.staffId, staffName: name };
    }
  }

  const hintName = hint?.staffName?.trim();
  if (hintName) {
    return { staffId: hint?.staffId, staffName: hintName };
  }

  return { staffId: hint?.staffId, staffName: "Staff" };
}
