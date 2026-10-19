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

/** A4 accounting report; the browser's print dialog can save it as a PDF. */
function buildTaxSummaryPdfDocument(report: TaxSummaryReport): string {
  const h = escapeHtml;
  const amount = (value: number) => h(formatReceiptAmount(value));
  const biz = report.business;
  const range = `${formatTaxSummaryRangeDate(report.rangeStart)} – ${formatTaxSummaryRangeDate(report.rangeEnd)}`;
  const total = report.sections[0]?.rows.find((row) => row.label === "Celkem");
  const businessLines = [biz.legalName, biz.companyAddress, biz.brandAddress !== biz.companyAddress ? biz.brandAddress : ""]
    .filter(Boolean).map((line) => `<p>${h(line)}</p>`).join("");
  const registration = [biz.ico && `IČO: ${biz.ico}`, biz.dic && `DIČ: ${biz.dic}`, biz.phone && `Tel: ${biz.phone}`]
    .filter(Boolean).map(h).join(" &nbsp; · &nbsp; ");
  const sections = report.sections.map((section, index) => {
    const title = index === 0 ? "Celkový přehled DPH" : section.title === "Jidelna" ? "Jídelna" : "S sebou";
    const rows = section.rows.map((row) => `
      <tr class="${row.label === "Celkem" ? "total" : ""}">
        <td>${h(row.label)}</td><td>${amount(row.base)}</td>
        <td>${amount(row.vat)}</td><td>${amount(row.gross)}</td>
      </tr>`).join("");
    return `<section class="tax-section">
      <div class="section-heading"><span class="index">0${index + 1}</span><h2>${title}</h2><span class="currency">CZK</span></div>
      <table><thead><tr><th>Sazba DPH</th><th>Základ daně</th><th>DPH</th><th>Celkem s DPH</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </section>`;
  }).join("");
  const metric = (label: string, value: string) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;

  return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8" />
    <title>Seoul Prague - Daňový souhrn - ${h(range)}</title>
    <style>
      @page { size: A4 portrait; margin: 16mm; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #fff; color: #242424; font: 10pt/1.5 Arial, sans-serif;
        -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .report { width: 100%; max-width: 178mm; margin: 0 auto; }
      p, h1, h2 { margin: 0; }
      header { display: flex; justify-content: space-between; gap: 8mm; padding: 0 0 6mm; border-bottom: 2px solid #b59776; }
      .brand { font: 23pt/1.15 Georgia, serif; letter-spacing: .06em; margin-bottom: 3mm; }
      .business { color: #606060; font-size: 8.5pt; overflow-wrap: anywhere; }
      .document-label { text-align: right; flex-shrink: 0; color: #836645; font-size: 8pt; letter-spacing: .14em; text-transform: uppercase; }
      .document-label strong { display: block; margin-top: 2mm; color: #242424; font-size: 11pt; letter-spacing: .03em; }
      .report-title { margin: 7mm 0 5mm; }
      .eyebrow { color: #836645; font-size: 8pt; letter-spacing: .15em; text-transform: uppercase; }
      h1 { font: 26pt/1.2 Georgia, serif; margin: 1.5mm 0 2mm; }
      .period { color: #606060; font-size: 10pt; }
      .metrics { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid #d8cbbb; border-radius: 3mm; overflow: hidden; margin-bottom: 7mm; }
      .metric { padding: 4mm; background: #faf7f2; border-right: 1px solid #d8cbbb; }
      .metric:last-child { border: 0; }
      .metric span { display: block; color: #6b6053; font-size: 8pt; margin-bottom: 1.5mm; }
      .metric strong { font-size: 13pt; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .tax-section { margin-bottom: 6mm; break-inside: avoid; page-break-inside: avoid; }
      .section-heading { display: flex; align-items: center; gap: 3mm; padding-bottom: 2mm; }
      .index { color: #a68b6a; font-size: 9pt; }
      h2 { font: 14pt Georgia, serif; }
      .currency { margin-left: auto; color: #777; font-size: 8pt; letter-spacing: .1em; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th { background: #292724; color: #fff; font-size: 8pt; font-weight: 600; padding: 2.5mm 3mm; }
      td { border-bottom: 1px solid #e7e2dc; padding: 2.5mm 3mm; font-variant-numeric: tabular-nums; }
      th, td { text-align: right; white-space: nowrap; }
      th:first-child, td:first-child { text-align: left; width: 22%; }
      .total td { background: #faf7f2; color: #3f3326; font-weight: 700; border-bottom: 1px solid #cdbbA6; }
      .meta { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 2mm; margin: 0 0 5mm; color: #606060; font-size: 8pt; }
      footer { border-top: 1px solid #d8cbbb; padding-top: 3mm; display: flex; justify-content: space-between; gap: 5mm; color: #777; font-size: 8pt; break-inside: avoid; }
      @media screen { body { background: #eae7e2; padding: 12mm; } .report { background: #fff; padding: 12mm; box-sizing: content-box; box-shadow: 0 8px 40px #0001; } }
    </style></head><body><article class="report">
      <header><div><p class="brand">${h(biz.brandName)}</p><div class="business">${businessLines}<p>${registration}</p></div></div>
        <div class="document-label">Seoul Prague<strong>Daňový přehled</strong></div></header>
      <div class="report-title"><p class="eyebrow">Souhrn faktur · Daňový souhrn</p><h1>Přehled DPH</h1><p class="period">${h(range)}</p></div>
      <div class="meta"><span>Počet dokladů: <b>${report.documentCount}</b></span><span>Vystaveno: ${h(formatReceiptDate(report.generatedAt))} ${h(formatReceiptTime(report.generatedAt))}</span></div>
      <div class="metrics">${metric("Základ daně · CZK", amount(total?.base ?? 0))}${metric("DPH celkem · CZK", amount(total?.vat ?? 0))}${metric("Celkem s DPH · CZK", amount(total?.gross ?? 0))}</div>
      ${sections}
      <footer><span>${h(biz.brandName)} · Přehled za vybrané období</span><span>Všechny částky v CZK</span></footer>
    </article></body></html>`;
}

export function printTaxSummaryPdf(report: TaxSummaryReport): Promise<void> {
  return printTaxSummaryDocument(buildTaxSummaryPdfDocument(report));
}

export async function printTaxSummaryReport(
  report: TaxSummaryReport,
  fontSettings?: ReceiptPrintFontSettings,
): Promise<void> {
  const html = buildTaxSummaryHtml(report);
  const docHtml = buildPrintDocument(html, fontSettings);

  return printTaxSummaryDocument(docHtml);
}

function printTaxSummaryDocument(docHtml: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    let cleanupTimer: number | undefined;
    const cleanup = () => {
      window.clearTimeout(cleanupTimer);
      iframe.remove();
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
        // Some browsers return from print() before the PDF dialog closes.
        // Keep the document alive until afterprint, with a fallback cleanup.
        iframe.contentWindow?.addEventListener("afterprint", cleanup, { once: true });
        cleanupTimer = window.setTimeout(cleanup, 120_000);
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        resolve();
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };

    window.setTimeout(runPrint, 250);
  });
}
