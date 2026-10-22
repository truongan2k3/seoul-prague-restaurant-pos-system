import { buildCheckoutTotals, calcDiscountAmount } from "@/lib/checkout-calculations";

export type ReferralRules = {
  discount_percent: number;
  commission_percent: number;
  min_spend: number;
  deduct_vouchers: boolean;
  deduct_other_discounts: boolean;
  exclude_tax: boolean;
  tax_rates: { A: number; B: number };
};
export type ReferralCode = ReferralRules & {
  id: string; business_id: string; code: string; partner_name: string; partner_contact: string;
  active: boolean; expires_at: string | null; usage_limit: number | null; usage_count: number;
  updated_at: string; created_at: string;
};
export type ReferralQuote = {
  codeId: string; code: string; partner: string; discountPercent: number; minSpend: number;
  active: boolean; expiresAt: string | null; remainingUses: number | null; redeemed: boolean;
  version: string; reservationId: string; visitSubtotal: number; lastInstallment: number;
};
export type ReferralPayment = {
  /** Bill owner captured when the quote was displayed; optional for older POS clients. */
  reservationId?: string;
  paymentKey: string; installment: number; codeId: string; version: string; discountPercent: number;
  discountAmount: number; overrideReason?: string;
};
export type ReferralLedgerRow = {
  id: string; business_id: string; code_id: string; sale_id: string; reservation_id: string;
  kind: "earned" | "adjustment"; amount: number; eligible_amount: number; gross_amount: number;
  discount_amount: number; reason: string; rules: ReferralRules & { code: string; partner_name: string };
  created_at: string;
};
export type ReferralPayout = { id: string; code_id: string; amount: number; paid_at: string; notes: string; created_at: string };
export type ReferralReservation = { id: string; referral_code_id: string; guest_name: string; party_size: number; reserved_at: string; checked_in_at: string | null; status: string; table_id: string | null; booking_code: string; actual_party_size: number | null; has_paid: boolean };
export type ReferralAudit = { id: string; code_id: string | null; action: string; actor_name: string; details: Record<string, unknown>; created_at: string };
export type ReferralDashboardData = { codes: ReferralCode[]; ledger: ReferralLedgerRow[]; payouts: ReferralPayout[]; reservations: ReferralReservation[]; audit: ReferralAudit[]; balances: { code_id: string; earned: number; paid: number; outstanding: number }[] };
export const normalizeReferralCode = (code: string) => code.trim().toUpperCase();
export function referralAvailable(quote: ReferralQuote, fullSubtotal: number): boolean {
  return quote.active && (!quote.expiresAt || new Date(quote.expiresAt).getTime() > Date.now()) &&
    (quote.redeemed || quote.remainingUses === null || quote.remainingUses > 0) &&
    Math.max(fullSubtotal, quote.redeemed ? quote.visitSubtotal : 0) >= quote.minSpend;
}

/** Reuse the existing totals engine. Referral precedes the existing staff discount; neither is duplicated. */
export function buildReferralCheckoutTotals(input: Parameters<typeof buildCheckoutTotals>[0] & { referralPercent?: number }) {
  const percent = input.referralPercent ?? 0;
  if (percent <= 0) return { ...buildCheckoutTotals(input), referralDiscountAmount: 0 };
  const clean = buildCheckoutTotals({ ...input, tip: 0, discountValue: 0, enablePriceRounding: false });
  const factor = input.splitMode === "equal" && input.equalAdjustScope === "bill" ? input.splitCount : 1;
  const scopeSubtotal = clean.subtotal * factor;
  const referral = calcDiscountAmount(scopeSubtotal, "percent", percent);
  const manual = calcDiscountAmount(scopeSubtotal - referral, input.discountType, input.discountValue);
  const result = buildCheckoutTotals({ ...input, discountType: "fixed", discountValue: referral + manual });
  const share = referral / factor;
  return { ...result, referralDiscountAmount: input.enablePriceRounding ? Math.round(share) : share };
}
export { sumLines as referralBillSubtotal } from "@/lib/checkout-calculations";
