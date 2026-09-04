import { isCancelActivityAction } from "@/lib/order-activity";
import { resolveOriginalUnitPrice } from "@/lib/order-line-pricing";
import { menuItemDisplayName, resolveMenuItemForOrder } from "@/lib/menu-display";
import { grossToVatBreakdown } from "@/lib/receipt-calculations";
import { VAT_RATES, type TaxGroup } from "@/lib/receipt-config";
import { defaultTaxGroupForItemType, taxGroupLabel } from "@/lib/tax-summary";
import type { LanguageCode, MenuItem, OrderItem, OrderLogEntry, SaleRecord } from "@/lib/types";

export interface SummaryItemStatRow {
  key: string;
  name: string;
  quantity: number;
  /** Gross at original unit prices — no line adjust, no bill discount. */
  originalTotal: number;
  taxGroup: TaxGroup;
  taxRate: number;
  taxBase: number;
  taxVat: number;
  taxGross: number;
  category: string;
  itemType: "food" | "drink";
}

export interface SummaryItemTaxTotal {
  label: string;
  rate?: number;
  base: number;
  vat: number;
  gross: number;
}

export interface SummaryItemStatsReport {
  rows: SummaryItemStatRow[];
  taxTotals: SummaryItemTaxTotal[];
  totalQuantity: number;
  totalOriginal: number;
}

function resolveTaxGroup(menu: MenuItem | undefined, item?: Pick<OrderItem, "taxGroup" | "itemType" | "station">): TaxGroup {
  if (item?.taxGroup === "A" || item?.taxGroup === "B") return item.taxGroup;
  if (menu?.taxGroup === "A" || menu?.taxGroup === "B") return menu.taxGroup;
  const itemType =
    item?.itemType ?? menu?.itemType ?? (item?.station === "bar" ? "drink" : "food");
  return defaultTaxGroupForItemType(itemType);
}

function itemMeta(
  item: Pick<OrderItem, "menuItemId" | "name" | "price" | "originalPrice" | "taxGroup" | "itemType" | "station">,
  menuItems: MenuItem[],
  language: LanguageCode,
) {
  const menu = resolveMenuItemForOrder(item, menuItems);
  const itemType: "food" | "drink" =
    menu?.itemType ?? item.itemType ?? (item.station === "bar" ? "drink" : "food");
  const category = menu?.category ?? (itemType === "drink" ? "Drinks" : "Other");
  const name = menu ? menuItemDisplayName(menu, language) : item.name;
  const taxGroup = resolveTaxGroup(menu, item);
  const unitPrice = resolveOriginalUnitPrice(item, menuItems);
  const key = item.menuItemId ?? `${name}::${taxGroup}`;
  return { key, name, category, itemType, taxGroup, unitPrice, menu };
}

function metaFromCancelEntry(
  entry: OrderLogEntry,
  menuItems: MenuItem[],
  language: LanguageCode,
) {
  const name = (entry.itemName ?? "Item").trim() || "Item";
  const qty = Math.max(0, Number(entry.meta?.quantity ?? 1) || 0);
  const synthetic: Pick<
    OrderItem,
    "menuItemId" | "name" | "price" | "originalPrice" | "taxGroup" | "itemType" | "station"
  > = {
    name,
    price: 0,
  };
  const menu = resolveMenuItemForOrder(synthetic, menuItems);
  if (menu) {
    synthetic.menuItemId = menu.id;
    synthetic.price = menu.price;
    synthetic.originalPrice = menu.price;
    synthetic.itemType = menu.itemType;
    synthetic.taxGroup = menu.taxGroup;
    synthetic.station = menu.station;
  }
  const meta = itemMeta(synthetic, menuItems, language);
  return { ...meta, quantity: qty };
}

function emptyTaxBucket(): Record<TaxGroup, { base: number; vat: number; gross: number }> {
  return {
    A: { base: 0, vat: 0, gross: 0 },
    B: { base: 0, vat: 0, gross: 0 },
  };
}

/**
 * Aggregate item quantities for Summary / Excel.
 * Includes: paid sale lines, voided (deleted) sale lines, and cancelled/removed activity.
 * Money uses original unit price only (ignores line edits and bill discounts).
 */
export function computeSummaryItemStats(
  sales: SaleRecord[],
  menuItems: MenuItem[],
  language: LanguageCode,
): SummaryItemStatsReport {
  const counts = new Map<
    string,
    {
      name: string;
      quantity: number;
      originalTotal: number;
      taxGroup: TaxGroup;
      category: string;
      itemType: "food" | "drink";
    }
  >();

  const addLine = (
    meta: {
      key: string;
      name: string;
      category: string;
      itemType: "food" | "drink";
      taxGroup: TaxGroup;
      unitPrice: number;
    },
    quantity: number,
  ) => {
    if (quantity <= 0) return;
    const existing = counts.get(meta.key);
    const lineTotal = meta.unitPrice * quantity;
    if (existing) {
      existing.quantity += quantity;
      existing.originalTotal += lineTotal;
    } else {
      counts.set(meta.key, {
        name: meta.name,
        quantity,
        originalTotal: lineTotal,
        taxGroup: meta.taxGroup,
        category: meta.category,
        itemType: meta.itemType,
      });
    }
  };

  for (const sale of sales) {
    for (const item of sale.items) {
      const meta = itemMeta(item, menuItems, language);
      addLine(meta, item.quantity);
    }

    for (const entry of sale.activityLog ?? []) {
      if (!isCancelActivityAction(entry.action)) continue;
      const cancelled = metaFromCancelEntry(entry, menuItems, language);
      addLine(cancelled, cancelled.quantity);
    }
  }

  const taxBucket = emptyTaxBucket();
  const rows: SummaryItemStatRow[] = [...counts.entries()]
    .map(([key, row]) => {
      const taxRate = VAT_RATES[row.taxGroup];
      const taxGross = row.originalTotal;
      const { base, vat } = grossToVatBreakdown(taxGross, taxRate);
      taxBucket[row.taxGroup].base += base;
      taxBucket[row.taxGroup].vat += vat;
      taxBucket[row.taxGroup].gross += taxGross;
      return {
        key,
        name: row.name,
        quantity: row.quantity,
        originalTotal: row.originalTotal,
        taxGroup: row.taxGroup,
        taxRate,
        taxBase: base,
        taxVat: vat,
        taxGross,
        category: row.category,
        itemType: row.itemType,
      };
    })
    .sort((a, b) => b.quantity - a.quantity || b.originalTotal - a.originalTotal || a.name.localeCompare(b.name));

  const taxTotals: SummaryItemTaxTotal[] = (["A", "B"] as const).map((group) => ({
    label: taxGroupLabel(group),
    rate: VAT_RATES[group],
    base: taxBucket[group].base,
    vat: taxBucket[group].vat,
    gross: taxBucket[group].gross,
  }));

  taxTotals.push({
    label: "Celkem",
    base: taxBucket.A.base + taxBucket.B.base,
    vat: taxBucket.A.vat + taxBucket.B.vat,
    gross: taxBucket.A.gross + taxBucket.B.gross,
  });

  return {
    rows,
    taxTotals,
    totalQuantity: rows.reduce((sum, row) => sum + row.quantity, 0),
    totalOriginal: rows.reduce((sum, row) => sum + row.originalTotal, 0),
  };
}
