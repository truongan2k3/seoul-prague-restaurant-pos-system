import {
  formatReceiptAmount,
  formatReceiptDate,
  formatReceiptTime,
  formatTaxSummaryRangeDate,
  type TaxSummaryReport,
} from "@/lib/tax-summary";
import {
  buildThermalPrintCss,
  receiptTypographyFromSettings,
} from "@/lib/receipt-print-styles";
import type { ReceiptPrintFontSettings } from "@/src/lib/printReceipt";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderSection(report: TaxSummaryReport, sectionIndex: number) {
  const section = report.sections[sectionIndex];
  const header = section.title
    ? `<p class="tax-section-title">${escapeHtml(section.title)}</p>`
    : "";

  const rows = section.rows
    .map((row) => {
      const isTotal = row.label === "Celkem";
      return `
        <tr class="${isTotal ? "tax-total-row" : ""}">
          <td>${escapeHtml(row.label)}</td>
          <td class="num">${escapeHtml(formatReceiptAmount(row.base))}</td>
          <td class="num">${escapeHtml(formatReceiptAmount(row.vat))}</td>
          <td class="num">${escapeHtml(formatReceiptAmount(row.gross))}</td>
        </tr>`;
    })
    .join("");

  return `
    ${header}
    <table class="tax-table">
      <thead>
        <tr>
          <th>Sazba</th>
          <th class="num">Základ</th>
          <th class="num">Daň</th>
          <th class="num">Celkem</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${sectionIndex < report.sections.length - 1 ? '<div class="divider dotted"></div>' : ""}
  `;
}

export function buildTaxSummaryHtml(report: TaxSummaryReport): string {
  const biz = report.business;
  const sections = report.sections.map((_, index) => renderSection(report, index)).join("");

  return `
    <article class="tax-summary-doc">
      <header class="text-center">
        <p class="tax-month">${escapeHtml(report.periodMonthLabel)}</p>
        <p class="tax-title">SOUHRN FAKTUR - Daňových</p>
        <p>DIČ: ${escapeHtml(biz.dic)}</p>
        <p class="receipt-title">${escapeHtml(biz.brandName)}</p>
        <p>${escapeHtml(biz.brandAddress)}</p>
        <p>Tel: ${escapeHtml(biz.phone)}</p>
        <p>${escapeHtml(formatReceiptTime(report.generatedAt))} ${escapeHtml(formatReceiptDate(report.generatedAt))}</p>
        <p class="tax-range">
          Datum dokladu Od:${escapeHtml(formatTaxSummaryRangeDate(report.rangeStart))}
          Do:${escapeHtml(formatTaxSummaryRangeDate(report.rangeEnd))}
        </p>
        <p class="tax-doc-count">Počet dokladů: ${report.documentCount}</p>
      </header>

      <div class="divider dotted"></div>

      ${sections}
    </article>
  `;
}

const TAX_SUMMARY_EXTRA_CSS = `
  .tax-summary-doc { width: 100%; }
  .tax-month { font-size: var(--receipt-title-size); font-weight: 700; margin: 0 0 4px; }
  .tax-title { font-size: var(--receipt-item-size); font-weight: 700; margin: 0 0 6px; text-transform: uppercase; }
  .tax-range, .tax-doc-count { margin: 2px 0; font-size: var(--receipt-meta-size); }
  .tax-section-title { font-weight: 700; margin: 8px 0 4px; font-size: var(--receipt-item-size); }
  .tax-table { width: 100%; border-collapse: collapse; font-size: var(--receipt-meta-size); margin: 4px 0 8px; }
  .tax-table th, .tax-table td { padding: 2px 0; vertical-align: top; }
  .tax-table th.num, .tax-table td.num { text-align: right; white-space: nowrap; }
  .tax-table th:first-child, .tax-table td:first-child { text-align: left; }
  .tax-total-row td { font-weight: 700; }
  .divider.dotted { border-top: 1px dashed #000; margin: 8px 0; }
`;

function buildPrintDocument(content: string, fontSettings?: ReceiptPrintFontSettings, paperWidthMm = 80) {
  const typography = fontSettings
    ? receiptTypographyFromSettings(fontSettings)
    : receiptTypographyFromSettings({
        receiptFontSize: "medium",
        receiptFontWeight: "bold",
        receiptFontFamily: "consolas",
      });

  return `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="utf-8" />
  <title>Daňový souhrn</title>
  <style>
    ${buildThermalPrintCss(typography, paperWidthMm)}
    ${TAX_SUMMARY_EXTRA_CSS}
    .text-center { text-align: center; }
    .receipt-title { font-size: ${typography.titlePx}px; font-weight: 700; margin: 4px 0; }
  </style>
</head>
<body>${content}</body>
</html>`;
}

export async function printTaxSummaryReport(
  report: TaxSummaryReport,
  fontSettings?: ReceiptPrintFontSettings,
): Promise<void> {
  const html = buildTaxSummaryHtml(report);
  const docHtml = buildPrintDocument(html, fontSettings);

  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const cleanup = () => {
      window.setTimeout(() => iframe.remove(), 500);
    };

    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) {
      cleanup();
      reject(new Error("Print iframe unavailable"));
      return;
    }

    doc.open();
    doc.write(docHtml);
    doc.close();

    const runPrint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        cleanup();
        resolve();
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };

    window.setTimeout(runPrint, 250);
  });
}
