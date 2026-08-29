import type { DiscountType, EqualAdjustScope } from "@/lib/checkout-calculations";

export type EqualSplitSessionState = {
  splitCount: number;
  paymentsMade: number;
  equalAdjustScope: EqualAdjustScope;
  discountType: DiscountType;
  discountValue: number;
  discountPreset: number | null;
  tipMode: "preset" | "custom";
  tipPreset: number | null;
  customTip: number;
};

function storageKey(tableId: string) {
  return `pos-equal-split:${tableId}`;
}

export function loadEqualSplitSession(tableId?: string | null): EqualSplitSessionState | null {
  if (!tableId || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(tableId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EqualSplitSessionState;
    if (!parsed || typeof parsed.splitCount !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistEqualSplitSession(
  tableId: string | undefined,
  state: EqualSplitSessionState,
) {
  if (!tableId || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(tableId), JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

export function clearEqualSplitSession(tableId?: string | null) {
  if (!tableId || typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey(tableId));
  } catch {
    // ignore
  }
}
