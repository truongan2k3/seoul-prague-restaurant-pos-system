import {
  buildReceiptLines,
  calcReceiptTaxGroups,
  formatReceiptAmount,
  formatReceiptDate,
  formatReceiptTime,
  grossToVatBreakdown,
  type ReceiptTaxGroupSummary,
} from "@/lib/receipt-calculations";
import { VAT_RATES, type TaxGroup } from "@/lib/receipt-config";
import type { MenuItem, SaleRecord } from "@/lib/types";
import type { DateRange } from "@/lib/summary-analytics";

export type ServiceChannel = "dine_in" | "takeaway";

/** Takeaway tables for tax summary (S sebou) — VAT on receipt stays item-based like dine-in. */
const TAKEAWAY_TABLE_CODES = new Set(["s1", "s2", "s3", "s5"]);

/** Leading table code from label, e.g. "S5 打包" → "S5". */
export function parseTableCode(tableLabel: string): string {
  const match = tableLabel.trim().match(/^([A-Za-z]+\d*)/);
  return match?.[1] ?? tableLabel.trim();
}

export function isTakeawayTable(tableLabel: string): boolean {
  return TAKEAWAY_TABLE_CODES.has(parseTableCode(tableLabel).toLowerCase());
}

export interface TaxSummaryRow {
  label: string;
  rate?: number;
  base: number;
  vat: number;
  gross: number;
}

export interface TaxSummarySection {
  title?: string;
  rows: TaxSummaryRow[];
}

export interface TaxSummaryReport {
  periodMonthLabel: string;
  rangeStart: Date;
  rangeEnd: Date;
  documentCount: number;
  generatedAt: Date;
  sections: TaxSummarySection[];
  business: {
    brandName: string;
    brandAddress: string;
    legalName: string;
    companyAddress: string;
    ico: string;
    dic: string;
    phone: string;
  };
}

type TaxBucket = Record<TaxGroup, { base: number; vat: number; gross: number }>;

function emptyBucket(): TaxBucket {
  return {
    A: { base: 0, vat: 0, gross: 0 },
    B: { base: 0, vat: 0, gross: 0 },
  };
}

export function defaultTaxGroupForItemType(itemType: MenuItem["itemType"]): TaxGroup {
  return itemType === "drink" ? "A" : "B";
}

export function taxRateForGroup(group: TaxGroup): number {
  return VAT_RATES[group];
}

export function taxGroupLabel(group: TaxGroup): string {
  return group === "A" ? `A  ${VAT_RATES.A}%` : `B  ${VAT_RATES.B}%`;
}

/** Takeaway only for configured table codes (S1, S2, S3, S5) in tax summary. */
export function inferServiceChannel(tableLabel: string): ServiceChannel {
  return isTakeawayTable(tableLabel) ? "takeaway" : "dine_in";
}

export function resolveSaleServiceChannel(sale: SaleRecord): ServiceChannel {
  return inferServiceChannel(sale.tableLabel);
}

function addTaxGroups(target: TaxBucket, groups: ReceiptTaxGroupSummary[]) {
  for (const row of groups) {
    target[row.group].base += row.base;
    target[row.group].vat += row.vat;
    target[row.group].gross += row.gross;
  }
}

function bucketToRows(bucket: TaxBucket): TaxSummaryRow[] {
  const rows: TaxSummaryRow[] = (["A", "B"] as const).map((group) => ({
    label: taxGroupLabel(group),
    rate: VAT_RATES[group],
    base: bucket[group].base,
    vat: bucket[group].vat,
    gross: bucket[group].gross,
  }));

  const totalBase = bucket.A.base + bucket.B.base;
  const totalVat = bucket.A.vat + bucket.B.vat;
  const totalGross = bucket.A.gross + bucket.B.gross;

  rows.push({
    label: "Celkem",
    base: totalBase,
    vat: totalVat,
    gross: totalGross,
  });

  return rows;
}

function saleTaxGroups(sale: SaleRecord, menuItems: MenuItem[]): ReceiptTaxGroupSummary[] {
  const menuById = new Map(menuItems.map((item) => [item.id, item]));
  const lines = buildReceiptLines(sale.items, menuById);
  if (lines.length === 0 && sale.grandTotal > 0) {
    const foodShare = sale.grandTotal * 0.7;
    const drinkShare = sale.grandTotal - foodShare;
    const groups: ReceiptTaxGroupSummary[] = [];
    if (drinkShare > 0.001) {
      const rate = VAT_RATES.A;
      const { base, vat } = grossToVatBreakdown(drinkShare, rate);
      groups.push({ group: "A", rate, gross: drinkShare, base, vat });
    }
    if (foodShare > 0.001) {
      const rate = VAT_RATES.B;
      const { base, vat } = grossToVatBreakdown(foodShare, rate);
      groups.push({ group: "B", rate, gross: foodShare, base, vat });
    }
    return groups;
  }
  return calcReceiptTaxGroups(lines, sale.subtotal, sale.discountAmount);
}

export function computeTaxSummaryReport(input: {
  sales: SaleRecord[];
  menuItems: MenuItem[];
  range: DateRange;
  business: TaxSummaryReport["business"];
  generatedAt?: Date;
}): TaxSummaryReport {
  const total = emptyBucket();
  const dineIn = emptyBucket();
  const takeaway = emptyBucket();

  for (const sale of input.sales) {
    const groups = saleTaxGroups(sale, input.menuItems);
    const channel = resolveSaleServiceChannel(sale);
    addTaxGroups(total, groups);
    addTaxGroups(channel === "takeaway" ? takeaway : dineIn, groups);
  }

  const generatedAt = input.generatedAt ?? new Date();
  const month = String(input.range.start.getMonth() + 1).padStart(2, "0");
  const year = input.range.start.getFullYear();

  return {
    periodMonthLabel: `${month}/${year}`,
    rangeStart: input.range.start,
    rangeEnd: input.range.end,
    documentCount: input.sales.length,
    generatedAt,
    business: input.business,
    sections: [
      { rows: bucketToRows(total) },
      { title: "Jidelna", rows: bucketToRows(dineIn) },
      { title: "S SEBOU", rows: bucketToRows(takeaway) },
    ],
  };
}

export function formatTaxSummaryRangeDate(date: Date): string {
  return formatReceiptDate(date);
}

export { formatReceiptAmount, formatReceiptDate, formatReceiptTime };
