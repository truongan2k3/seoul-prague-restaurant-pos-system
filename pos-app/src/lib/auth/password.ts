import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string, salt?: string) {
  const passwordSalt = salt ?? randomBytes(16).toString("hex");
  const hash = scryptSync(password, passwordSalt, SCRYPT_KEYLEN).toString("hex");
  return { hash, salt: passwordSalt };
}

export function verifyPassword(password: string, hash: string, salt: string) {
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

export function slugifyBusinessName(name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "business";
}

export function uniqueSlugSuffix() {
  return createHash("sha256").update(randomBytes(8)).digest("hex").slice(0, 6);
}
