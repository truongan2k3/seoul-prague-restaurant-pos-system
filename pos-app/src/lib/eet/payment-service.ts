import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { EetPaymentIntent } from "./types";
import type { eetActor } from "./auth";

export function paymentFingerprint(value: unknown): string {
  const canonical = (input: unknown): unknown => input instanceof Date ? input.toISOString() : Array.isArray(input) ? input.map(canonical)
    : input && typeof input === "object" ? Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : input;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

/** Prevent the legacy public referral Server Action from bypassing the EET checkout boundary. */
export function eetReferralAuthorization(sale: Record<string, unknown>, intent: EetPaymentIntent) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Strong server authentication secret required.");
  return createHmac("sha256", secret).update(`eet-referral:${paymentFingerprint({ sale, intent })}`).digest("hex");
}
export function verifyEetReferralAuthorization(sale: Record<string, unknown>, intent: EetPaymentIntent | undefined, proof: string | undefined) {
  if (!intent || typeof proof !== "string" || !/^[0-9a-f]{64}$/.test(proof)) throw new Error("Use the secure EET checkout action for this referral payment.");
  const expected = eetReferralAuthorization(sale, intent);
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(proof))) throw new Error("Referral fiscal authorization failed.");
}

/** Called only after server-side ordinary/referral payment validation. Never imported by React. */
export async function commitValidatedEetSale(context: Awaited<ReturnType<typeof eetActor>>, sale: Record<string, unknown>, intent: EetPaymentIntent) {
  const { db, businessId, staff } = context;
  const { data, error } = await db.rpc("eet_commit_sale", { p_sale: sale, p_business_id: businessId, p_staff_id: staff.id,
    p_key: intent.key, p_fingerprint: sale.eet_payment_fingerprint, p_revision: intent.expectedRevision });
  if (error) throw new Error(error.message);
  return data as { id: string; replayed: boolean; skipSettlement: boolean };
}
