import * as XLSX from "xlsx";
import type { LanguageCode } from "@/lib/types";
import { formatSummaryDate, type DateRange } from "@/lib/summary-analytics";
import type {
  SummaryItemStatRow,
  SummaryItemStatsReport,
  SummaryItemTaxTotal,
  SummaryTypeTotal,
} from "@/lib/summary-item-stats";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export type SummaryExcelLabels = {
  itemsSheet: string;
  taxSheet: string;
  itemName: string;
  quantity: string;
  originalTotal: string;
  taxRate: string;
  taxBase: string;
  taxVat: string;
  taxGross: string;
  category: string;
  itemType: string;
  period: string;
  note: string;
  soldSection: string;
  cancelledSection: string;
  typeTotalsSection: string;
  categoryTotalsSection: string;
  overviewSection: string;
  soldTotal: string;
  cancelledTotal: string;
  grandTotal: string;
  food: string;
  drinks: string;
  emptyCancelled: string;
  subtotal: string;
};

function itemHeader(labels: SummaryExcelLabels) {
  return [
    labels.itemName,
    labels.quantity,
    labels.originalTotal,
    labels.taxRate,
    labels.taxBase,
    labels.taxVat,
    labels.taxGross,
    labels.category,
    labels.itemType,
  ];
}

function itemDataRow(row: SummaryItemStatRow, labels: SummaryExcelLabels) {
  const typeLabel = row.itemType === "drink" ? labels.drinks : labels.food;
  return [
    row.name,
    row.quantity,
    roundMoney(row.originalTotal),
    `${row.taxRate}%`,
    roundMoney(row.taxBase),
    roundMoney(row.taxVat),
    roundMoney(row.taxGross),
    row.category,
    typeLabel,
  ];
}

function pushSectionTitle(rows: unknown[][], title: string) {
  rows.push([title]);
}

function pushBlank(rows: unknown[][]) {
  rows.push([]);
}

function pushItemBlock(
  rows: unknown[][],
  title: string,
  itemRows: SummaryItemStatRow[],
  labels: SummaryExcelLabels,
  emptyLabel?: string,
) {
  pushSectionTitle(rows, title);
  rows.push(itemHeader(labels));
  if (itemRows.length === 0) {
    rows.push([emptyLabel || "—", 0, 0]);
  } else {
    for (const row of itemRows) {
      rows.push(itemDataRow(row, labels));
    }
  }
  const qty = itemRows.reduce((sum, row) => sum + row.quantity, 0);
  const total = itemRows.reduce((sum, row) => sum + row.originalTotal, 0);
  rows.push([labels.subtotal, qty, roundMoney(total)]);
  pushBlank(rows);
}

function pushTypeTotals(
  rows: unknown[][],
  title: string,
  totals: SummaryTypeTotal[],
  labels: SummaryExcelLabels,
) {
  pushSectionTitle(rows, title);
  rows.push([labels.itemType, labels.quantity, labels.originalTotal]);
  for (const row of totals) {
    const label =
      row.key === "drink" ? labels.drinks : row.key === "food" ? labels.food : row.label;
    rows.push([label, row.quantity, roundMoney(row.originalTotal)]);
  }
  if (totals.length === 0) {
    rows.push(["—", 0, 0]);
  }
  pushBlank(rows);
}

function pushCategoryTotals(
  rows: unknown[][],
  title: string,
  totals: SummaryTypeTotal[],
  labels: SummaryExcelLabels,
) {
  pushSectionTitle(rows, title);
  rows.push([labels.category, labels.quantity, labels.originalTotal]);
  for (const row of totals) {
    rows.push([row.label, row.quantity, roundMoney(row.originalTotal)]);
  }
  if (totals.length === 0) {
    rows.push(["—", 0, 0]);
  }
  pushBlank(rows);
}

function pushTaxBlock(rows: unknown[][], title: string, totals: SummaryItemTaxTotal[], labels: SummaryExcelLabels) {
  pushSectionTitle(rows, title);
  rows.push([labels.taxRate, labels.taxBase, labels.taxVat, labels.taxGross]);
  for (const row of totals) {
    rows.push([
      row.label,
      roundMoney(row.base),
      roundMoney(row.vat),
      roundMoney(row.gross),
    ]);
  }
  pushBlank(rows);
}

export function buildSummaryItemsWorkbook(
  report: SummaryItemStatsReport,
  range: DateRange,
  language: LanguageCode,
  labels: SummaryExcelLabels,
): XLSX.WorkBook {
  const periodLabel = `${formatSummaryDate(range.start, language)} – ${formatSummaryDate(range.end, language)}`;

  const itemRows: unknown[][] = [
    [labels.period, periodLabel],
    [labels.note],
    [],
    [labels.overviewSection],
    [labels.soldTotal, report.soldQuantity, roundMoney(report.soldOriginal)],
    [labels.cancelledTotal, report.cancelledQuantity, roundMoney(report.cancelledOriginal)],
    [labels.grandTotal, report.totalQuantity, roundMoney(report.totalOriginal)],
    [],
  ];

  pushItemBlock(itemRows, labels.soldSection, report.soldRows, labels);
  pushItemBlock(
    itemRows,
    labels.cancelledSection,
    report.cancelledRows,
    labels,
    labels.emptyCancelled,
  );

  pushTypeTotals(itemRows, `${labels.typeTotalsSection} — ${labels.soldSection}`, report.soldTypeTotals, labels);
  pushTypeTotals(
    itemRows,
    `${labels.typeTotalsSection} — ${labels.cancelledSection}`,
    report.cancelledTypeTotals,
    labels,
  );
  pushTypeTotals(itemRows, `${labels.typeTotalsSection} — ${labels.grandTotal}`, report.typeTotals, labels);
  pushCategoryTotals(itemRows, labels.categoryTotalsSection, report.categoryTotals, labels);

  const taxRows: unknown[][] = [
    [labels.period, periodLabel],
    [],
  ];
  pushTaxBlock(taxRows, `${labels.taxSheet} — ${labels.soldSection}`, report.soldTaxTotals, labels);
  pushTaxBlock(
    taxRows,
    `${labels.taxSheet} — ${labels.cancelledSection}`,
    report.cancelledTaxTotals,
    labels,
  );
  pushTaxBlock(taxRows, `${labels.taxSheet} — ${labels.grandTotal}`, report.taxTotals, labels);

  const itemsSheet = XLSX.utils.aoa_to_sheet(itemRows);
  const taxSheet = XLSX.utils.aoa_to_sheet(taxRows);
  itemsSheet["!cols"] = [
    { wch: 38 },
    { wch: 12 },
    { wch: 16 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 12 },
  ];
  taxSheet["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];

  // Highlight section titles (col A where next row looks like a header / known titles)
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, itemsSheet, labels.itemsSheet.slice(0, 31));
  XLSX.utils.book_append_sheet(workbook, taxSheet, labels.taxSheet.slice(0, 31));
  return workbook;
}

export function downloadSummaryItemsExcel(
  report: SummaryItemStatsReport,
  range: DateRange,
  language: LanguageCode,
  labels: SummaryExcelLabels,
  fileName?: string,
) {
  const workbook = buildSummaryItemsWorkbook(report, range, language, labels);
  const stamp = `${range.start.getFullYear()}${String(range.start.getMonth() + 1).padStart(2, "0")}${String(range.start.getDate()).padStart(2, "0")}`;
  XLSX.writeFile(workbook, fileName ?? `summary-items-${stamp}.xlsx`);
}
