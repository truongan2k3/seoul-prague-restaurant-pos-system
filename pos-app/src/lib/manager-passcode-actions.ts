"use server";

import { normalizeStaffRole } from "@/lib/staff-roles";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import {
  DEFAULT_APP_SETTINGS,
  fetchAppSettings,
  updateAppSettings,
} from "@/src/lib/settings-actions";

export async function verifyManagerPasscodeForBusiness(businessId: string, passcode: string) {
  const { data } = await fetchAppSettings(businessId);
  const expected = (data.adminDeletionPassword || DEFAULT_APP_SETTINGS.adminDeletionPassword).trim();
  return passcode.trim() === expected;
}

export async function changeManagerPasscodeAction(input: {
  currentPasscode: string;
  newPasscode: string;
  confirmPasscode: string;
}) {
  const businessSession = await readAuthSession();
  if (!businessSession) {
    return { ok: false as const, error: "unauthorized" };
  }

  const staffSession = await readStaffSession();
  if (!staffSession || staffSession.businessId !== businessSession.businessId) {
    return { ok: false as const, error: "unauthorized" };
  }

  if (normalizeStaffRole(staffSession.staffRole) !== "admin") {
    return { ok: false as const, error: "adminOnly" };
  }

  const current = input.currentPasscode.trim();
  const next = input.newPasscode.trim();
  const confirm = input.confirmPasscode.trim();

  if (!next) {
    return { ok: false as const, error: "passwordTooShort" };
  }
  if (next !== confirm) {
    return { ok: false as const, error: "passcodeMismatch" };
  }

  const valid = await verifyManagerPasscodeForBusiness(businessSession.businessId, current);
  if (!valid) {
    return { ok: false as const, error: "invalidCurrentPasscode" };
  }

  const { error } = await updateAppSettings(
    { adminDeletionPassword: next },
    businessSession.businessId,
  );

  if (error) {
    return { ok: false as const, error: "saveFailed" };
  }

  return { ok: true as const };
}
