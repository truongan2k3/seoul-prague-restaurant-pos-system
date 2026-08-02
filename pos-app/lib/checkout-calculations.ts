import { formatCzk } from "@/lib/currency";
import type { OrderItem } from "@/lib/types";

export { formatCzk };

export type DiscountType = "percent" | "fixed";
export type SplitMode = "total" | "equal" | "items";

export interface CheckoutLine extends OrderItem {
  lineId: string;
}

export interface CheckoutPaymentRecord {
  paymentMethod: "cash" | "card";
  subtotal: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  tip: number;
  grandTotal: number;
  amountDueNow: number;
  amountGiven?: number;
  changeDue?: number;
  tipFromChange?: number;
  splitMode: SplitMode;
  splitCount: number;
}

export function lineTotal(line: OrderItem) {
  return line.price * line.quantity;
}

export function sumLines(lines: OrderItem[]) {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

export function calcDiscountAmount(
  subtotal: number,
  discountType: DiscountType,
  discountValue: number,
) {
  if (discountValue <= 0 || subtotal <= 0) return 0;
  if (discountType === "percent") {
    return Math.min(subtotal, (subtotal * discountValue) / 100);
  }
  return Math.min(subtotal, discountValue);
}

export function calcTipFromPercent(subtotalAfterDiscount: number, percent: number) {
  if (percent <= 0) return 0;
  return (subtotalAfterDiscount * percent) / 100;
}

export function buildCheckoutTotals(input: {
  lines: OrderItem[];
  discountType: DiscountType;
  discountValue: number;
  tip: number;
  splitMode: SplitMode;
  splitCount: number;
  selectedLineIds?: string[];
  allLines?: CheckoutLine[];
}) {
  const payableLines =
    input.splitMode === "items" && input.allLines && input.selectedLineIds
      ? input.allLines.filter((line) => input.selectedLineIds!.includes(line.lineId))
      : input.lines;

  const subtotal = sumLines(payableLines);
  const discountAmount = calcDiscountAmount(subtotal, input.discountType, input.discountValue);
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const grandTotal = afterDiscount + input.tip;

  let amountDueNow = grandTotal;
  if (input.splitMode === "equal" && input.splitCount > 1) {
    amountDueNow = grandTotal / input.splitCount;
  }

  return {
    payableLines,
    subtotal,
    discountAmount,
    afterDiscount,
    grandTotal,
    amountDueNow,
  };
}

export function calcChangeDue(amountGiven: number, amountDue: number) {
  return Math.max(0, amountGiven - amountDue);
}

/** Expand merged lines so each quantity unit is individually selectable (split-by-item). */
export function expandCheckoutLines(orders: OrderItem[]): CheckoutLine[] {
  const result: CheckoutLine[] = [];

  orders.forEach((item, orderIndex) => {
    const units = Math.max(1, Math.floor(item.quantity));
    for (let unitIndex = 0; unitIndex < units; unitIndex++) {
      result.push({
        ...item,
        quantity: 1,
        lineId: item.id
          ? `${item.id}::u${unitIndex}`
          : `line-${orderIndex}-${unitIndex}-${item.menuItemId ?? "x"}-${item.price}-${item.notes ?? ""}-${item.station ?? ""}`,
      });
    }
  });

  return result;
}

export function ordersFromLines(lines: OrderItem[]): OrderItem[] {
  return lines.map((line) => {
    const { lineId: _lineId, ...item } = line as OrderItem & { lineId?: string };
    return item;
  });
}

export function remainingLines(
  allLines: CheckoutLine[],
  paidLineIds: string[],
): CheckoutLine[] {
  const paidSet = new Set(paidLineIds);
  return allLines.filter((line) => !paidSet.has(line.lineId));
}

export interface CheckoutSubmitPayload {
  paidOrders: OrderItem[];
  payment: CheckoutPaymentRecord;
  remainingLines?: CheckoutLine[];
  closeTable: boolean;
}
