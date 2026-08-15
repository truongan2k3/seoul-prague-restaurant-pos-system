import type { CheckoutPaymentRecord } from "@/lib/checkout-calculations";
import { menuItemMatchesOrderName } from "@/lib/menu-display";
import { RECEIPT_BUSINESS, VAT_RATES, type TaxGroup } from "@/lib/receipt-config";
import { defaultTaxGroupForItemType } from "@/lib/tax-summary";
import type { MenuItem, OrderItem, PaymentMethod } from "@/lib/types";

export interface ReceiptLineItem {
  code: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  taxGroup: TaxGroup;
}

export interface ReceiptTaxGroupSummary {
  group: TaxGroup;
  rate: number;
  gross: number;
  base: number;
  vat: number;
}

export interface ReceiptData {
  orderNumber: string;
  tableLabel: string;
  staffName?: string;
  items: ReceiptLineItem[];
  subtotal: number;
  discountAmount: number;
  discountLabel?: string;
  discountPercent?: number;
  tip: number;
  grandTotal: number;
  paymentMethod: PaymentMethod;
  amountGiven?: number;
  changeDue?: number;
  closedAt: Date;
  taxGroups: ReceiptTaxGroupSummary[];
  cardAuthCode?: string;
  cardLast4?: string;
  cardBrand?: string;
  showEur?: boolean;
  showUsd?: boolean;
  eurRate?: number;
  usdRate?: number;
  business?: {
    brandName: string;
    brandAddress: string;
    legalName: string;
    companyAddress: string;
    ico: string;
    dic: string;
    phone: string;
    footerLines: string[];
  };
}

/** Czech receipt amount: 1 398,00 */
export function formatReceiptAmount(amount: number): string {
  const fixed = amount.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${withSpaces},${decPart}`;
}

export function formatReceiptDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

export function formatReceiptTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Short daily receipt index shown large at top (e.g. 019). */
export function formatReceiptDisplayIndex(orderNumber: string): string {
  const digits = orderNumber.replace(/\D/g, "");
  const tail = digits.slice(-3);
  return tail.padStart(3, "0");
}

export function generateOrderNumber(closedAt: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${closedAt.getFullYear()}${pad(closedAt.getMonth() + 1)}${pad(closedAt.getDate())}${pad(closedAt.getHours())}${pad(closedAt.getMinutes())}${pad(closedAt.getSeconds())}`;
}

function resolveTaxGroup(menuItem?: MenuItem, order?: OrderItem): TaxGroup {
  if (order?.taxGroup === "A" || order?.taxGroup === "B") return order.taxGroup;
  if (menuItem?.taxGroup === "A" || menuItem?.taxGroup === "B") return menuItem.taxGroup;
  const itemType = order?.itemType ?? menuItem?.itemType;
  if (itemType) return defaultTaxGroupForItemType(itemType);
  return "B";
}

export function resolveItemCode(
  menuItem: MenuItem | undefined,
  index: number,
  order?: Pick<OrderItem, "itemType">,
): string {
  if (menuItem) {
    const prefix = menuItem.itemType === "drink" ? "D" : "P";
    const num = menuItem.sortOrder > 0 ? menuItem.sortOrder : index + 1;
    return `${prefix}${num}`;
  }
  if (order?.itemType) {
    const prefix = order.itemType === "drink" ? "D" : "P";
    return `${prefix}${index + 1}`;
  }
  return `X${index + 1}`;
}

export function buildReceiptLines(
  orders: OrderItem[],
  menuById: Map<string, MenuItem>,
): ReceiptLineItem[] {
  return orders.map((item, index) => {
    const menuItem = item.menuItemId ? menuById.get(item.menuItemId) : undefined;
    const matchedMenu =
      menuItem ??
      [...menuById.values()].find(
        (m) => menuItemMatchesOrderName(m, item.name) && m.price === item.price,
      );

    return {
      code: resolveItemCode(matchedMenu, index, item),
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.price,
      lineTotal: item.price * item.quantity,
      taxGroup: resolveTaxGroup(matchedMenu, item),
    };
  });
}

/** VAT-inclusive gross → base (Základ) and DPH */
export function grossToVatBreakdown(gross: number, rate: number) {
  const base = gross / (1 + rate / 100);
  const vat = gross - base;
  return { base, vat };
}

export function calcReceiptTaxGroups(
  items: ReceiptLineItem[],
  subtotal: number,
  discountAmount: number,
): ReceiptTaxGroupSummary[] {
  if (subtotal <= 0) return [];

  const discountRatio = Math.max(0, (subtotal - discountAmount) / subtotal);

  const grossByGroup: Record<TaxGroup, number> = { A: 0, B: 0 };
  for (const line of items) {
    grossByGroup[line.taxGroup] += line.lineTotal * discountRatio;
  }

  return (["A", "B"] as const)
    .filter((group) => grossByGroup[group] > 0.001)
    .map((group) => {
      const gross = grossByGroup[group];
      const rate = VAT_RATES[group];
      const { base, vat } = grossToVatBreakdown(gross, rate);
      return { group, rate, gross, base, vat };
    });
}

export function buildReceiptData(input: {
  tableLabel: string;
  staffName?: string;
  orders: OrderItem[];
  payment: CheckoutPaymentRecord;
  menuItems: MenuItem[];
  closedAt?: Date;
  showEur?: boolean;
  showUsd?: boolean;
  eurRate?: number;
  usdRate?: number;
  business?: ReceiptData["business"];
}): ReceiptData {
  const closedAt = input.closedAt ?? new Date();
  const menuById = new Map(input.menuItems.map((m) => [m.id, m]));
  const items = buildReceiptLines(input.orders, menuById);

  const ratio =
    input.payment.splitMode === "equal" && input.payment.splitCount > 1
      ? 1 / input.payment.splitCount
      : 1;

  const subtotal = input.payment.subtotal * ratio;
  const discountAmount = input.payment.discountAmount * ratio;
  const tip = input.payment.tip * ratio;
  const grandTotal = input.payment.amountDueNow;

  const discountLabel =
    input.payment.discountAmount > 0
      ? input.payment.discountType === "percent"
        ? `Sleva (${input.payment.discountValue}%):`
        : "Sleva:"
      : undefined;

  const discountPercent =
    input.payment.discountAmount > 0 && input.payment.discountType === "percent"
      ? input.payment.discountValue
      : undefined;

  const taxGroups = calcReceiptTaxGroups(
    items,
    input.payment.subtotal,
    input.payment.discountAmount,
  ).map((row) =>
    ratio < 1
      ? {
          ...row,
          gross: row.gross * ratio,
          base: row.base * ratio,
          vat: row.vat * ratio,
        }
      : row,
  );

  return {
    orderNumber: generateOrderNumber(closedAt),
    tableLabel: input.tableLabel,
    staffName: input.staffName,
    items,
    subtotal,
    discountAmount,
    discountLabel,
    discountPercent,
    tip,
    grandTotal,
    paymentMethod: input.payment.paymentMethod,
    amountGiven: input.payment.amountGiven,
    changeDue: input.payment.changeDue,
    cardAuthCode: input.payment.cardAuthCode,
    cardLast4: input.payment.cardLast4,
    cardBrand: input.payment.cardBrand,
    closedAt,
    taxGroups,
    showEur: input.showEur,
    showUsd: input.showUsd,
    eurRate: input.eurRate,
    usdRate: input.usdRate,
    business: input.business,
  };
}

export function buildTestReceiptData(business: ReceiptData["business"]): ReceiptData {
  const closedAt = new Date();
  return {
    orderNumber: generateOrderNumber(closedAt),
    tableLabel: "T5",
    staffName: "Master Liu",
    items: [
      {
        code: "P1",
        name: "Signature Hotpot Broth",
        quantity: 2,
        unitPrice: 189,
        lineTotal: 378,
        taxGroup: "B",
      },
      {
        code: "D1",
        name: "Plum Juice",
        quantity: 2,
        unitPrice: 59,
        lineTotal: 118,
        taxGroup: "A",
      },
    ],
    subtotal: 496,
    discountAmount: 49.6,
    discountLabel: "Sleva (10%):",
    discountPercent: 10,
    tip: 50,
    grandTotal: 496.4,
    paymentMethod: "card",
    cardAuthCode: "A98765",
    cardLast4: "4321",
    cardBrand: "Mastercard",
    closedAt,
    taxGroups: [
      { group: "A", rate: 21, gross: 106.2, base: 87.77, vat: 18.43 },
      { group: "B", rate: 12, gross: 340.2, base: 303.75, vat: 36.45 },
    ],
    business,
  };
}

export { RECEIPT_BUSINESS };
