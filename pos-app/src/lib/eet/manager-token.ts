import { createHmac, timingSafeEqual } from "node:crypto";

export const EET_MANAGER_TTL_MS = 10 * 60_000;
export interface EetManagerGrant { businessId: string; staffId: string; sessionHash: string; codeHash: string; expiresAt: number }
function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("EET requires a strong AUTH_SECRET (at least 32 characters).");
  return value;
}
export function managerFingerprint(value: string) { return createHmac("sha256", secret()).update(value).digest("hex"); }
export function encodeManagerGrant(grant: EetManagerGrant) {
  const data = Buffer.from(JSON.stringify(grant)).toString("base64url");
  return `${data}.${managerFingerprint(data)}`;
}
export function decodeManagerGrant(token: string | undefined, expected: Omit<EetManagerGrant, "expiresAt">, now = Date.now()): EetManagerGrant | null {
  try {
    if (!token || token.length > 2048) return null;
    const parts = token.split(".");
    if (parts.length !== 2 || !/^[0-9a-f]{64}$/.test(parts[1])) return null;
    const signature = Buffer.from(parts[1], "hex"), computed = Buffer.from(managerFingerprint(parts[0]), "hex");
    if (!timingSafeEqual(signature, computed)) return null;
    const grant = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as EetManagerGrant;
    if (!Number.isSafeInteger(grant.expiresAt) || grant.expiresAt <= now || grant.expiresAt > now + EET_MANAGER_TTL_MS) return null;
    if (grant.businessId !== expected.businessId || grant.staffId !== expected.staffId || grant.sessionHash !== expected.sessionHash || grant.codeHash !== expected.codeHash) return null;
    return grant;
  } catch { return null; }
}
