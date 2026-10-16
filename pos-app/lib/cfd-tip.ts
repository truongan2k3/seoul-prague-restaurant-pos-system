import { buildCheckoutTotals } from "@/lib/checkout-calculations";
import { buildReferralCheckoutTotals } from "@/lib/referrals";

/** Draft-only guest choices. No sale or voucher is written by this protocol. */
export const CFD_TIP_PERCENTAGES = [5, 10, 15, 20, 0] as const;
export type CfdTipPercent = (typeof CFD_TIP_PERCENTAGES)[number];

/** getRandomValues also works on restaurant LAN displays served over HTTP. */
export function newCfdTipId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface CfdTipOffer {
  sessionId: string;
  /** Changes whenever the bill, split guest, discount, or voucher changes. */
  revision: string;
  base: number;
  choices: Array<{ percent: CfdTipPercent; tip: number; total: number }>;
  percent: CfdTipPercent | null;
  enabled: boolean;
  selectionVersion: number;
  requestId?: string;
}

export interface CfdTipRequest {
  sessionId: string;
  revision: string;
  percent: CfdTipPercent;
  requestId: string;
}

export function isCfdTipRequest(value: unknown): value is CfdTipRequest {
  if (!value || typeof value !== "object") return false;
  const v = value as CfdTipRequest;
  return typeof v.sessionId === "string" && v.sessionId.length > 0 &&
    typeof v.revision === "string" && v.revision.length > 0 &&
    typeof v.requestId === "string" && v.requestId.length > 0 &&
    CFD_TIP_PERCENTAGES.includes(v.percent);
}

export function canApplyCfdTip(offer: CfdTipOffer, request: unknown): request is CfdTipRequest {
  return isCfdTipRequest(request) && offer.enabled &&
    offer.sessionId === request.sessionId && offer.revision === request.revision;
}

export function cfdTipAmount(base: number, percent: CfdTipPercent): number {
  return Number((Math.max(0, base) * percent / 100).toFixed(2));
}

/** Preview and checkout use the same discount, split, rounding and voucher rules. */
export function buildCfdTipChoices(
  input: Omit<Parameters<typeof buildCheckoutTotals>[0], "tip"> & {referralPercent?: number},
  voucherCredit: number,
) {
  const baseTotals = buildReferralCheckoutTotals({ ...input, tip: 0 });
  const factor = input.splitMode === "equal" && input.equalAdjustScope === "bill"
    ? input.splitCount : 1;
  const base = baseTotals.tipBase / factor;
  const voucher = Math.min(Math.max(0, voucherCredit), Math.max(0, baseTotals.afterDiscount));
  const choices = CFD_TIP_PERCENTAGES.map((percent) => {
    const tip = cfdTipAmount(base, percent);
    const totals = buildReferralCheckoutTotals({ ...input, tip: tip * factor });
    return { percent, tip, total: Math.max(0, totals.amountDueNow - voucher) };
  });
  return { base, choices };
}
