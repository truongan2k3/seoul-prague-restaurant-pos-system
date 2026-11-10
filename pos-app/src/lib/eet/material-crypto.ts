import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type MaterialEnvironment = "shared" | "playground" | "production";
export type MaterialKind = "protocol" | "signer" | "response";
export interface MaterialScope { businessId: string; environment: MaterialEnvironment; kind: MaterialKind }
export interface EncryptedMaterial { v: 1; keyId: string; iv: string; tag: string; ciphertext: string }

function rootKey(encoded = process.env.EET_SETTINGS_ENCRYPTION_KEY) {
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error("Configure the server EET settings encryption key.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("Invalid EET settings encryption key.");
  return key;
}
export function materialEncryptionReady() {
  try { rootKey(); return true; } catch { return false; }
}
function aad(scope: MaterialScope) {
  return Buffer.from(JSON.stringify(["seoul-eet-material", 1, scope.businessId, scope.environment, scope.kind]), "utf8");
}
export function encryptMaterial(scope: MaterialScope, payload: unknown, encodedKey?: string): EncryptedMaterial {
  const key = rootKey(encodedKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(scope));
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  if (plaintext.length > 256 * 1024) throw new Error("EET material is too large.");
  try {
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { v: 1, keyId: createHash("sha256").update(key).digest("hex").slice(0, 16), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
  } finally { plaintext.fill(0); key.fill(0); }
}
export function decryptMaterial<T>(scope: MaterialScope, envelope: EncryptedMaterial, encodedKey?: string): T {
  const key = rootKey(encodedKey);
  let plaintext: Buffer | undefined;
  try {
    if (!envelope || envelope.v !== 1 || envelope.keyId !== createHash("sha256").update(key).digest("hex").slice(0, 16) || typeof envelope.ciphertext !== "string" || envelope.ciphertext.length > 360_000) throw new Error("Invalid material envelope.");
    const iv = Buffer.from(envelope.iv, "base64"), tag = Buffer.from(envelope.tag, "base64");
    if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid material envelope.");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(aad(scope)); decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch { throw new Error("Stored EET material could not be decrypted. Check the server encryption key."); }
  finally { key.fill(0); plaintext?.fill(0); }
}
