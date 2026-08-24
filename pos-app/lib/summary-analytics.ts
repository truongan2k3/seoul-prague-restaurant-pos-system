import { menuItemDisplayName, resolveMenuItemForOrder } from "@/lib/menu-display";
import type { LanguageCode, MenuItem, OrderItem, PaymentMethod, SaleRecord } from "@/lib/types";

export type SummaryPeriod = "today" | "yesterday" | "week" | "month" | "custom";

export type TopSellerGroup = "all" | "food" | "drink" | "category";

export interface DateRange {
  start: Date;
  end: Date;
}

export interface RevenueStats {
  /** Sales total excluding tips (after discounts). */
  revenue: number;
  /** Total collected from guests (revenue + tips). */
  grandTotal: number;
  cash: number;
  card: number;
  tips: number;
  cashTips: number;
  cardTips: number;
  orderCount: number;
}

/** Bill amount before tip (subtotal − discount, equals grandTotal − tip). */
export function saleNetTotal(sale: SaleRecord): number {
  return Math.max(0, sale.grandTotal - sale.tip);
}

export function isActiveSale(sale: SaleRecord): boolean {
  return !sale.deletedAt;
}

export function activeSalesOnly(sales: SaleRecord[]): SaleRecord[] {
  return sales.filter(isActiveSale);
}

export function computeRevenueStats(sales: SaleRecord[]): RevenueStats {
  const active = activeSalesOnly(sales);
  return {
    revenue: active.reduce((sum, sale) => sum + saleNetTotal(sale), 0),
    grandTotal: active.reduce((sum, sale) => sum + sale.grandTotal, 0),
    cash: active
      .filter((sale) => sale.paymentMethod === "cash")
      .reduce((sum, sale) => sum + saleNetTotal(sale), 0),
    card: active
      .filter((sale) => sale.paymentMethod === "card")
      .reduce((sum, sale) => sum + saleNetTotal(sale), 0),
    tips: active.reduce((sum, sale) => sum + sale.tip, 0),
    cashTips: active
      .filter((sale) => resolveTipPaymentMethod(sale) === "cash")
      .reduce((sum, sale) => sum + sale.tip, 0),
    cardTips: active
      .filter((sale) => resolveTipPaymentMethod(sale) === "card")
      .reduce((sum, sale) => sum + sale.tip, 0),
    orderCount: active.length,
  };
}

export interface TopSellerRow {
  key: string;
  name: string;
  quantity: number;
  revenue: number;
  category: string;
  itemType: "food" | "drink";
}

export interface CategoryTopSellers {
  category: string;
  items: TopSellerRow[];
  totalQuantity: number;
}

export function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

export function getPeriodRange(
  period: SummaryPeriod,
  customRange?: { from?: string; to?: string },
): DateRange {
  const now = new Date();

  if (period === "today") {
    return { start: startOfDay(now), end: endOfDay(now) };
  }

  if (period === "yesterday") {
    const day = new Date(now);
    day.setDate(day.getDate() - 1);
    return { start: startOfDay(day), end: endOfDay(day) };
  }

  if (period === "week") {
    const start = startOfDay(now);
    const weekday = start.getDay();
    const mondayOffset = weekday === 0 ? 6 : weekday - 1;
    start.setDate(start.getDate() - mondayOffset);
    return { start, end: endOfDay(now) };
  }

  if (period === "month") {
    const start = startOfDay(now);
    start.setDate(1);
    return { start, end: endOfDay(now) };
  }

  const fromRaw = customRange?.from?.trim();
  const toRaw = customRange?.to?.trim() || fromRaw;
  const fromDate = fromRaw ? new Date(`${fromRaw}T12:00:00`) : now;
  const toDate = toRaw ? new Date(`${toRaw}T12:00:00`) : fromDate;
  const earlier = fromDate.getTime() <= toDate.getTime() ? fromDate : toDate;
  const later = fromDate.getTime() <= toDate.getTime() ? toDate : fromDate;
  return { start: startOfDay(earlier), end: endOfDay(later) };
}

export function filterSalesInRange(sales: SaleRecord[], range: DateRange): SaleRecord[] {
  return sales.filter(
    (sale) => sale.closedAt.getTime() >= range.start.getTime() && sale.closedAt.getTime() <= range.end.getTime(),
  );
}

export function computeRevenueChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

function saleItemMeta(
  item: OrderItem,
  menuItems: MenuItem[],
  language: LanguageCode,
): Pick<TopSellerRow, "name" | "category" | "itemType"> & { key: string } {
  const menu = resolveMenuItemForOrder(item, menuItems);
  const itemType: "food" | "drink" =
    menu?.itemType ?? (item.station === "bar" ? "drink" : "food");
  const category = menu?.category ?? (itemType === "drink" ? "Drinks" : "Other");
  const name = menu ? menuItemDisplayName(menu, language) : item.name;
  const key = item.menuItemId ?? `${name}::${item.price}`;

  return { key, name, category, itemType };
}

function aggregateTopSellers(
  sales: SaleRecord[],
  menuItems: MenuItem[],
  language: LanguageCode,
  predicate: (meta: ReturnType<typeof saleItemMeta>) => boolean,
): TopSellerRow[] {
  const counts = new Map<string, TopSellerRow>();

  for (const sale of sales) {
    if (!isActiveSale(sale)) continue;
    for (const item of sale.items) {
      const meta = saleItemMeta(item, menuItems, language);
      if (!predicate(meta)) continue;

      const existing = counts.get(meta.key);
      const lineRevenue = item.price * item.quantity;
      if (existing) {
        existing.quantity += item.quantity;
        existing.revenue += lineRevenue;
      } else {
        counts.set(meta.key, {
          key: meta.key,
          name: meta.name,
          quantity: item.quantity,
          revenue: lineRevenue,
          category: meta.category,
          itemType: meta.itemType,
        });
      }
    }
  }

  return [...counts.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
}

export function computeTopSellers(
  sales: SaleRecord[],
  menuItems: MenuItem[],
  language: LanguageCode,
  group: TopSellerGroup,
  limit = 10,
): TopSellerRow[] | CategoryTopSellers[] {
  if (group === "category") {
    const all = aggregateTopSellers(sales, menuItems, language, () => true);
    const byCategory = new Map<string, TopSellerRow[]>();

    for (const row of all) {
      const list = byCategory.get(row.category) ?? [];
      list.push(row);
      byCategory.set(row.category, list);
    }

    return [...byCategory.entries()]
      .map(([category, items]) => ({
        category,
        items: items.sort((a, b) => b.quantity - a.quantity).slice(0, limit),
        totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
      }))
      .sort((a, b) => b.totalQuantity - a.totalQuantity);
  }

  const predicate =
    group === "food"
      ? (meta: ReturnType<typeof saleItemMeta>) => meta.itemType === "food"
      : group === "drink"
        ? (meta: ReturnType<typeof saleItemMeta>) => meta.itemType === "drink"
        : () => true;

  return aggregateTopSellers(sales, menuItems, language, predicate).slice(0, limit);
}

export function formatSummaryDate(date: Date, language: LanguageCode): string {
  return date.toLocaleDateString(language === "cs" ? "cs-CZ" : language === "zh" ? "zh-CN" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type HistoryPaymentFilter = "all" | "cash" | "card";

export function resolveTipPaymentMethod(sale: Pick<SaleRecord, "paymentMethod" | "tipPaymentMethod">): PaymentMethod {
  return sale.tipPaymentMethod ?? sale.paymentMethod;
}

export function filterHistorySales(
  sales: SaleRecord[],
  period: SummaryPeriod,
  payment: HistoryPaymentFilter,
  customRange?: { from?: string; to?: string },
): SaleRecord[] {
  const range = getPeriodRange(period, customRange);
  let result = filterSalesInRange(sales, range);
  if (payment !== "all") {
    result = result.filter((sale) => sale.paymentMethod === payment);
  }
  return result;
}
