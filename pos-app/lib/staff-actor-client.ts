export type StaffActor = {
  staffId?: string;
  staffName: string;
};

/** Client-side staff attribution — avoids a server-action round trip on every order. */
export function resolveStaffActorLocal(hint?: {
  staffId?: string;
  staffName?: string;
}): StaffActor {
  const name = hint?.staffName?.trim();
  return {
    staffId: hint?.staffId,
    staffName: name || "Staff",
  };
}
