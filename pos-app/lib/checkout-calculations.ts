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
  cardAuthCode?: string;
  cardLast4?: string;
  cardBrand?: string;
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
  enablePriceRounding?: boolean;
}) {
  const payableLines =
    input.splitMode === "items" && input.allLines && input.selectedLineIds
      ? input.allLines.filter((line) => input.selectedLineIds!.includes(line.lineId))
      : input.lines;

  const fullSubtotal = sumLines(payableLines);
  const isEqualSplit = input.splitMode === "equal" && input.splitCount > 1;
  // Equal split: tip/discount apply to THIS person's share only (not the full bill).
  const subtotal = isEqualSplit ? fullSubtotal / input.splitCount : fullSubtotal;
  const discountAmount = calcDiscountAmount(subtotal, input.discountType, input.discountValue);
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const grandTotal = afterDiscount + input.tip;
  const amountDueNow = grandTotal;

  const round = (value: number) =>
    input.enablePriceRounding ? Math.round(value) : value;

  return {
    payableLines,
    subtotal: round(subtotal),
    discountAmount: round(discountAmount),
    afterDiscount: round(afterDiscount),
    grandTotal: round(grandTotal),
    amountDueNow: round(amountDueNow),
    /** Full bill before equal split (same as subtotal when not equal-splitting). */
    fullSubtotal: round(fullSubtotal),
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

function checkoutLineMergeKey(line: OrderItem) {
  return [
    line.id ?? "",
    line.menuItemId ?? "",
    line.name,
    line.price,
    line.notes ?? "",
    line.station ?? "",
  ].join("\0");
}

/** Collapse unit-expanded checkout lines back into consolidated order rows. */
export function mergeCheckoutLines(lines: Array<OrderItem & { lineId?: string }>): OrderItem[] {
  const merged: OrderItem[] = [];
  const indexByKey = new Map<string, number>();

  for (const line of lines) {
    const key = checkoutLineMergeKey(line);
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, merged.length);
      const { lineId: _lineId, ...item } = line;
      merged.push({ ...item });
      continue;
    }
    merged[existingIndex] = {
      ...merged[existingIndex],
      quantity: merged[existingIndex].quantity + line.quantity,
    };
  }

  return merged;
}

/** Scale line prices for one equal-split share (quantities unchanged). */
export function scaleOrdersForEqualSplit(orders: OrderItem[], splitCount: number): OrderItem[] {
  if (splitCount <= 1) return orders;
  const ratio = 1 / splitCount;
  return orders.map((item) => ({
    ...item,
    price: Number((item.price * ratio).toFixed(2)),
  }));
}

export function equalSplitShareRatio(splitMode: SplitMode, splitCount: number) {
  return splitMode === "equal" && splitCount > 1 ? 1 / splitCount : 1;
}

/**
 * Per-person amounts for equal split.
 * Payment payload is already one person's share (tip/discount included);
 * this only normalizes rounding.
 */
export function buildEqualSplitShareAmounts(input: {
  subtotal: number;
  discountAmount: number;
  tip: number;
  amountDueNow: number;
  grandTotal: number;
  splitCount: number;
}) {
  const subtotal = Number(input.subtotal.toFixed(2));
  const discountAmount = Number(input.discountAmount.toFixed(2));
  const grandTotal = Number(input.grandTotal.toFixed(2));
  const tip = Number(input.tip.toFixed(2));
  return {
    subtotal,
    discountAmount,
    tip,
    amountDueNow: Number(input.amountDueNow.toFixed(2)),
    grandTotal,
  };
}

/** Resume an in-progress equal-split from prior sales for this table visit. */
export function resolveEqualSplitProgress(sales: Array<{
  splitMode?: string | null;
  splitCount?: number | null;
  closedAt?: Date | string | null;
}>, occupiedAt?: Date | null) {
  const sinceMs = occupiedAt ? occupiedAt.getTime() - 60_000 : 0;
  const equalSales = sales.filter((sale) => {
    if (sale.splitMode !== "equal") return false;
    const count = Number(sale.splitCount) || 0;
    if (count < 2) return false;
    if (!sinceMs) return true;
    const closed = sale.closedAt ? new Date(sale.closedAt).getTime() : 0;
    return closed >= sinceMs;
  });

  if (equalSales.length === 0) {
    return { paymentsMade: 0, splitCount: 0 };
  }

  // Newest first
  equalSales.sort((a, b) => {
    const aTime = a.closedAt ? new Date(a.closedAt).getTime() : 0;
    const bTime = b.closedAt ? new Date(b.closedAt).getTime() : 0;
    return bTime - aTime;
  });

  const splitCount = Math.max(2, Number(equalSales[0]?.splitCount) || 0);
  let paymentsMade = 0;
  for (const sale of equalSales) {
    if (Number(sale.splitCount) !== splitCount) break;
    paymentsMade += 1;
  }

  if (paymentsMade >= splitCount) {
    return { paymentsMade: 0, splitCount: 0 };
  }

  return { paymentsMade, splitCount };
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
  /** When omitted, falls back to settings.autoPrintOnPayment */
  printReceipt?: boolean;
}
