import { buildReferralCheckoutTotals, referralAvailable, type ReferralQuote } from "@/lib/referrals";
import { sumLines, type DiscountType } from "@/lib/checkout-calculations";
import type { OrderItem, ReservationRecord } from "@/lib/types";

type FloorBillPricing = {
  owner?: symbol;
  visitKey: string | null;
  itemKey: string;
  quote: ReferralQuote | null;
  overridePercent?: number;
  discountType: DiscountType;
  discountValue: number;
};
const previews = new Map<string, FloorBillPricing>();
const listeners = new Set<() => void>();
export function subscribeFloorBillPricing(listener: () => void) {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
export function getFloorBillPricing(tableId: string) { return previews.get(tableId); }
export function floorBillItemKey(items: OrderItem[]) {
  return JSON.stringify(items.flatMap(item => {
    const ids = item.unitIds?.length ? item.unitIds : [item.id ?? item.menuItemId ?? item.name];
    return ids.map(id => [id, ids.length > 1 ? 1 : item.quantity, item.price]);
  }).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}
export function cacheFloorBillPricing(tableId: string, next: FloorBillPricing) {
  const previous = previews.get(tableId);
  if (previous?.owner === next.owner && JSON.stringify(previous) === JSON.stringify(next)) return;
  previews.set(tableId, next);
  listeners.forEach(listener => listener());
}
export function releaseFloorBillPricing(tableId: string, owner: symbol) {
  const previous = previews.get(tableId);
  if (previous?.owner !== owner) return;
  // Cancelling checkout discards its temporary staff adjustments; the validated referral remains cached.
  cacheFloorBillPricing(tableId, { ...previous, owner: undefined, discountValue: 0, overridePercent: undefined });
}
/** Existing reservation updates invalidate a removed/reassigned referral without fetching another quote. */
export function reconcileFloorBillReservations(reservations: ReservationRecord[]) {
  const seen = new Set<string>();
  for (const reservation of reservations.filter(row => row.status === "checked_in").sort((a, b) =>
    (a.checkedInAt?.getTime() ?? Infinity) - (b.checkedInAt?.getTime() ?? Infinity) || a.id.localeCompare(b.id))) {
    for (const id of [reservation.tableId, reservation.secondaryTableId, reservation.tertiaryTableId]) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const pricing = previews.get(id);
      if (pricing?.quote && (pricing.quote.reservationId !== reservation.id || pricing.quote.codeId !== reservation.referralCodeId)) {
        cacheFloorBillPricing(id, { ...pricing, quote: null, overridePercent: undefined });
      }
    }
  }
}
export function calculateFloorBillTotal(items: OrderItem[], visitKey: string | null, pricing: FloorBillPricing | undefined, enablePriceRounding: boolean) {
  const current = pricing && (visitKey ? pricing.visitKey === visitKey : pricing.visitKey === null && pricing.itemKey === floorBillItemKey(items)) ? pricing : undefined;
  const quote = current?.quote;
  const referralPercent = quote && quote.discountAllowed !== false
    ? current?.overridePercent ?? (referralAvailable(quote, sumLines(items)) ? quote.discountPercent : 0)
    : 0;
  return buildReferralCheckoutTotals({
    lines: items, referralPercent,
    discountType: current?.discountType ?? "percent", discountValue: current?.discountValue ?? 0,
    tip: 0, splitMode: "total", splitCount: 1, enablePriceRounding,
  }).grandTotal;
}
