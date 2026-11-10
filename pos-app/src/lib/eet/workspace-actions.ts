"use server";

import { eetActor } from "./auth";
import { getEetSettingsAction } from "./actions";
import { clearManagerSession, issueManagerSession, managerCode, managerSession, sameManagerCode } from "./manager-session";
import { materialEncryptionReady } from "./material-crypto";
import { describeEetSetupFailure } from "./setup-diagnostics";
import { getEetSetupScripts } from "./setup-guide";

export async function getEetWorkspaceAction() {
  let scripts: Awaited<ReturnType<typeof getEetSetupScripts>> = [];
  try {
    const actor = await eetActor(true, { managerUnlock: true });
    scripts = await getEetSetupScripts();
    const grant = await managerSession(actor.businessId, actor.staff.id);
    if (!grant) return { state: "locked" as const, scripts, encryptionReady: materialEncryptionReady() };
    const settings = await getEetSettingsAction();
    return { state: "ready" as const, settings, scripts, expiresAt: grant.expiresAt };
  } catch (error) {
    return { state: "error" as const, issue: describeEetSetupFailure(error), scripts, encryptionReady: materialEncryptionReady() };
  }
}

export async function unlockEetWorkspaceAction(code: string) {
  try {
    const { db, businessId, staff } = await eetActor(true, { managerUnlock: true });
    if (typeof code !== "string" || code.length > 128 || !code.trim()) return { ok: false as const, message: "Enter your manager code." };
    const { data: permitted, error } = await db.rpc("eet_manager_unlock_attempt", { p_business: businessId, p_actor: staff.id });
    if (error) return { ok: false as const, message: "The manager-access database check failed. Install step 4 below if it is missing; otherwise check database connectivity and service-role permissions. Uploads and settings stay locked." };
    if (permitted !== true) return { ok: false as const, message: "Too many unlock attempts. Try again in 15 minutes." };
    const expected = await managerCode(businessId);
    if (!sameManagerCode(code.trim(), expected)) return { ok: false as const, message: "Incorrect manager code." };
    const { error: auditError } = await db.from("eet_audit_logs").insert({ business_id: businessId, actor_id: staff.id, action: "manager_unlocked", details: { duration_minutes: 10 } });
    if (auditError) return { ok: false as const, message: "Could not record manager authorization. Try again after checking EET storage." };
    await issueManagerSession(businessId, staff.id, expected);
    return { ok: true as const, message: "EET unlocked for 10 minutes." };
  } catch { return { ok: false as const, message: "EET authorization unavailable. Check the allowed staff ID, active business and configured manager code, then recheck setup." }; }
}

export async function lockEetWorkspaceAction() { await clearManagerSession(); }
