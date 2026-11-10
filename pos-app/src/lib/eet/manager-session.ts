import "server-only";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { STAFF_COOKIE_NAME } from "@/src/lib/auth/staff-session-token";
import { eetDb } from "./db";
import { decodeManagerGrant, encodeManagerGrant, managerFingerprint, EET_MANAGER_TTL_MS } from "./manager-token";

export const EET_MANAGER_COOKIE = "pos_eet_manager";
export class EetManagerLocked extends Error { constructor() { super("Enter the manager code to unlock EET settings."); } }
export async function managerCode(businessId: string) {
  const { data, error } = await eetDb().from("settings").select("admin_deletion_password").eq("business_id", businessId).maybeSingle();
  const code = typeof data?.admin_deletion_password === "string" ? data.admin_deletion_password.trim() : "";
  if (error || code.length < 4 || code.length > 128) throw new Error("Configure a manager code in POS Settings → Security before unlocking EET.");
  return code;
}
export function sameManagerCode(provided: string, expected: string) {
  return timingSafeEqual(Buffer.from(managerFingerprint(provided)), Buffer.from(managerFingerprint(expected)));
}
export async function managerSession(businessId: string, staffId: string) {
  const jar = await cookies();
  const session = jar.get(STAFF_COOKIE_NAME)?.value;
  if (!session) return null;
  const code = await managerCode(businessId);
  return decodeManagerGrant(jar.get(EET_MANAGER_COOKIE)?.value, { businessId, staffId, sessionHash: managerFingerprint(session), codeHash: managerFingerprint(code) });
}
export async function requireManagerSession(businessId: string, staffId: string) {
  if (!await managerSession(businessId, staffId)) throw new EetManagerLocked();
}
export async function issueManagerSession(businessId: string, staffId: string, code: string) {
  const jar = await cookies();
  const session = jar.get(STAFF_COOKIE_NAME)?.value;
  if (!session) throw new EetManagerLocked();
  const expiresAt = Date.now() + EET_MANAGER_TTL_MS;
  const grant = { businessId, staffId, sessionHash: managerFingerprint(session), codeHash: managerFingerprint(code), expiresAt };
  jar.set(EET_MANAGER_COOKIE, encodeManagerGrant(grant), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: EET_MANAGER_TTL_MS / 1000 });
  return expiresAt;
}
export async function clearManagerSession() { (await cookies()).delete(EET_MANAGER_COOKIE); }
