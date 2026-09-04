import * as XLSX from "xlsx";
import type { LanguageCode } from "@/lib/types";
import { formatSummaryDate, type DateRange } from "@/lib/summary-analytics";
import type { SummaryItemStatsReport } from "@/lib/summary-item-stats";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildSummaryItemsWorkbook(
  report: SummaryItemStatsReport,
  range: DateRange,
  language: LanguageCode,
  labels: {
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
    period: string;
    note: string;
  },
): XLSX.WorkBook {
  const periodLabel = `${formatSummaryDate(range.start, language)} – ${formatSummaryDate(range.end, language)}`;

  const itemRows = [
    [labels.period, periodLabel],
    [labels.note],
    [],
    [
      labels.itemName,
      labels.quantity,
      labels.originalTotal,
      labels.taxRate,
      labels.taxBase,
      labels.taxVat,
      labels.taxGross,
      labels.category,
    ],
    ...report.rows.map((row) => [
      row.name,
      row.quantity,
      roundMoney(row.originalTotal),
      `${row.taxRate}%`,
      roundMoney(row.taxBase),
      roundMoney(row.taxVat),
      roundMoney(row.taxGross),
      row.category,
    ]),
    [],
    ["", report.totalQuantity, roundMoney(report.totalOriginal)],
  ];

  const taxRows = [
    [labels.period, periodLabel],
    [],
    [labels.taxRate, labels.taxBase, labels.taxVat, labels.taxGross],
    ...report.taxTotals.map((row) => [
      row.label,
      roundMoney(row.base),
      roundMoney(row.vat),
      roundMoney(row.gross),
    ]),
  ];

  const itemsSheet = XLSX.utils.aoa_to_sheet(itemRows);
  const taxSheet = XLSX.utils.aoa_to_sheet(taxRows);
  itemsSheet["!cols"] = [
    { wch: 36 },
    { wch: 12 },
    { wch: 14 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
  ];
  taxSheet["!cols"] = [{ wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, itemsSheet, labels.itemsSheet.slice(0, 31));
  XLSX.utils.book_append_sheet(workbook, taxSheet, labels.taxSheet.slice(0, 31));
  return workbook;
}

export function downloadSummaryItemsExcel(
  report: SummaryItemStatsReport,
  range: DateRange,
  language: LanguageCode,
  labels: Parameters<typeof buildSummaryItemsWorkbook>[3],
  fileName?: string,
) {
  const workbook = buildSummaryItemsWorkbook(report, range, language, labels);
  const stamp = `${range.start.getFullYear()}${String(range.start.getMonth() + 1).padStart(2, "0")}${String(range.start.getDate()).padStart(2, "0")}`;
  XLSX.writeFile(workbook, fileName ?? `summary-items-${stamp}.xlsx`);
}
