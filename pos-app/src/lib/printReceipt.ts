import {
  formatReceiptAmount,
  formatReceiptDate,
  formatReceiptDisplayIndex,
  formatReceiptTime,
  type ReceiptData,
} from "@/lib/receipt-calculations";
import { formatEurFromCzk } from "@/lib/currency";
import {
  buildThermalPrintCss,
  receiptBitmapTypographyFromSettings,
  receiptTypographyFromSettings,
  type ReceiptTypography,
} from "@/lib/receipt-print-styles";
import type { AppSettings } from "@/lib/types";
import type { ReceiptTemplate } from "@/src/components/ReceiptPrint";
import { receiptShouldUseBitmap } from "@/lib/print-dispatch";

const PRINT_IFRAME_ID = "receipt-print-iframe";

export type ReceiptPrintFontSettings = Pick<
  AppSettings,
  "receiptFontSize" | "receiptFontWeight" | "receiptFontFamily"
> &
  Partial<Pick<AppSettings, "receiptPrintBitmap">> &
  Partial<
    Pick<
      AppSettings,
      "silentPrintEnabled" | "printBridgeUrl" | "browserPrintFallback" | "printers"
    >
  > & {
    /** Thermal paper width in mm (kitchen tickets use 80). */
    paperWidthMm?: number;
  };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveTemplate(data: ReceiptData, template?: ReceiptTemplate): ReceiptTemplate {
  if (template) return template;
  if (data.business) {
    return {
      brandName: data.business.brandName,
      brandAddress: data.business.brandAddress,
      legalName: data.business.legalName,
      companyAddress: data.business.companyAddress,
      ico: data.business.ico,
      dic: data.business.dic,
      phone: data.business.phone,
      footerLines: data.business.footerLines,
    };
  }
  return {
    brandName: "JIN CHENG",
    brandAddress: "Václavské nám. 819, 110 00 Praha",
    legalName: "JING DE INTER.TRADE, s.r.o.",
    companyAddress: "Václavské náměstí 819/43, 110 00 Praha",
    ico: "25682199",
    dic: "CZ25682199",
    phone: "+420 222 240 429",
    footerLines: [
      "Děkujeme za Vaši návštěvu!",
      "Otevírací doba: Po-Ne 10:00-22:00",
    ],
  };
}

function formatCardMask(last4: string): string {
  return `**** **** **** ${last4}`;
}

function paymentMethodLabel(method: ReceiptData["paymentMethod"]): string {
  return method === "cash" ? "hotovost" : "debetní karta";
}

function buildCardPaymentSection(data: ReceiptData): string {
  if (data.paymentMethod !== "card" || !data.cardLast4) return "";

  const brand = escapeHtml(data.cardBrand ?? "Card");
  const mask = escapeHtml(formatCardMask(data.cardLast4));
  const authLine = data.cardAuthCode
    ? `<p class="text-center">Auth Code: ${escapeHtml(data.cardAuthCode)}</p>`
    : "";

  return `
    <div class="divider"></div>
    <section class="receipt-card-payment">
      <p class="text-center bold">PLATBA KARTOU / CARD PAYMENT</p>
      <p class="text-center">Karta: ${brand} (${mask})</p>
      ${authLine}
      <p class="text-center">Trans. Status: SCHVÁLENO / APPROVED</p>
    </section>`;
}

export function buildReceiptHtmlContent(data: ReceiptData, template?: ReceiptTemplate): string {
  const biz = resolveTemplate(data, template);
  const displayIndex = formatReceiptDisplayIndex(data.orderNumber);

  const itemRows = data.items
    .map(
      (item) => `
    <div class="receipt-item">
      <span class="receipt-item-left">${escapeHtml(item.code)} ${escapeHtml(item.name)}</span>
      <span class="receipt-item-right">${item.quantity} ${escapeHtml(formatReceiptAmount(item.lineTotal))} ${escapeHtml(item.taxGroup)}</span>
    </div>`,
    )
    .join("");

  const discountRow =
    data.discountAmount > 0
      ? `<div class="flex-between"><span>${escapeHtml(data.discountLabel ?? "Sleva:")}</span><span>${escapeHtml(formatReceiptAmount(data.discountAmount))} CZK</span></div>`
      : "";

  const cashRows =
    data.paymentMethod === "cash" && data.amountGiven != null
      ? `
    <div class="flex-between"><span>Přijato:</span><span>${escapeHtml(formatReceiptAmount(data.amountGiven))} CZK</span></div>
    <div class="flex-between bold"><span>Vráceno:</span><span>${escapeHtml(formatReceiptAmount(data.changeDue ?? 0))} CZK</span></div>`
      : "";

  const eurRow =
    data.showEur && data.eurRate
      ? `<p class="text-center">≈ ${escapeHtml(formatEurFromCzk(data.grandTotal, data.eurRate))}</p>`
      : "";

  const vatRows = data.taxGroups
    .map(
      (row) => `
      <tr>
        <td>${escapeHtml(String(row.rate))}</td>
        <td class="text-right">${escapeHtml(formatReceiptAmount(row.vat))}</td>
        <td class="text-right">${escapeHtml(formatReceiptAmount(row.base))}</td>
      </tr>`,
    )
    .join("");

  const footerLines = biz.footerLines
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");

  return `
    <header class="text-center">
      <p class="receipt-index">${escapeHtml(displayIndex)}</p>
      <p>Č.: ${escapeHtml(data.orderNumber)}</p>
      <p class="receipt-title">${escapeHtml(biz.brandName)}</p>
      <p class="text-center">${escapeHtml(biz.brandAddress)}</p>
      <p class="text-center">${escapeHtml(biz.legalName)}</p>
      <p class="text-center">${escapeHtml(biz.companyAddress)}</p>
      <p class="text-center">IČO: ${escapeHtml(biz.ico)}&nbsp;&nbsp;&nbsp;DIČ: ${escapeHtml(biz.dic)}</p>
      <div class="receipt-meta-row">
        <div class="receipt-meta-col">
          <span>Tel: ${escapeHtml(biz.phone)}</span>
          <span>Stůl č. ${escapeHtml(data.tableLabel)}</span>
        </div>
        <div class="receipt-meta-col receipt-meta-right">
          <span>Datum: ${escapeHtml(formatReceiptDate(data.closedAt))}</span>
          <span>Čas: ${escapeHtml(formatReceiptTime(data.closedAt))}</span>
        </div>
      </div>
    </header>

    <div class="divider"></div>

    <section>
      <div class="receipt-items-head">
        <span>Kód Položka</span>
        <span>Částka</span>
      </div>
      ${itemRows}
    </section>

    <div class="divider"></div>

    <section>
      <div class="flex-between"><span>Mezisoučet:</span><span>${escapeHtml(formatReceiptAmount(data.subtotal))} CZK</span></div>
      ${discountRow}
      <div class="receipt-celkem">
        <span>CELKEM</span>
        <span>${escapeHtml(formatReceiptAmount(data.grandTotal))} CZK</span>
      </div>
      ${eurRow}
      <p class="receipt-payment">${escapeHtml(paymentMethodLabel(data.paymentMethod))}</p>
      ${cashRows}
    </section>

    ${buildCardPaymentSection(data)}

    <div class="divider"></div>

    <table>
      <thead>
        <tr>
          <th>Rate (%)</th>
          <th class="text-right">DPH</th>
          <th class="text-right">Základ</th>
        </tr>
      </thead>
      <tbody>${vatRows}</tbody>
    </table>

    <footer class="receipt-footer">${footerLines}</footer>
  `.trim();
}

function getOrCreatePrintIframe(): HTMLIFrameElement {
  const existing = document.getElementById(PRINT_IFRAME_ID) as HTMLIFrameElement | null;
  if (existing) {
    existing.remove();
  }

  const iframe = document.createElement("iframe");
  iframe.id = PRINT_IFRAME_ID;
  iframe.title = "Receipt print frame";
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "80mm";
  iframe.style.height = "240mm";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.style.colorScheme = "only light";
  document.body.appendChild(iframe);
  return iframe;
}

function buildPrintDocument(
  bodyHtml: string,
  typography: ReceiptTypography,
  paperWidthMm: number,
): string {
  return `<!DOCTYPE html>
<html lang="zh-CN" style="color-scheme: only light;">
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="only light" />
    <title>Receipt</title>
    <style>${buildThermalPrintCss(typography, paperWidthMm)}</style>
  </head>
  <body>${bodyHtml}</body>
</html>`;
}

function resolvePrintTypography(fontSettings?: ReceiptPrintFontSettings): ReceiptTypography {
  if (!fontSettings) {
    return receiptTypographyFromSettings({
      receiptFontSize: "medium",
      receiptFontWeight: "bold",
      receiptFontFamily: "courier",
    });
  }
  return receiptTypographyFromSettings(fontSettings);
}

export function printReceiptHTML(
  receiptHtmlContent: string,
  fontSettings?: ReceiptPrintFontSettings,
): Promise<void> {
  if (typeof document === "undefined") {
    return Promise.reject(new Error("Print is only available in the browser"));
  }

  return new Promise((resolve, reject) => {
    const iframe = getOrCreatePrintIframe();
    const printWindow = iframe.contentWindow;
    const doc = iframe.contentDocument ?? printWindow?.document;

    if (!doc || !printWindow) {
      iframe.remove();
      reject(new Error("Unable to access print iframe"));
      return;
    }

    const cleanup = () => {
      window.setTimeout(() => {
        iframe.remove();
      }, 500);
    };

    const runPrint = () => {
      try {
        printWindow.focus();
        printWindow.print();
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        cleanup();
      }
    };

    const typography = resolvePrintTypography(fontSettings);
    const paperWidthMm = fontSettings?.paperWidthMm ?? 72;

    doc.open();
    doc.write(buildPrintDocument(receiptHtmlContent, typography, paperWidthMm));
    doc.close();

    const waitForReady = async () => {
      const images = Array.from(doc.images);
      await Promise.all(
        images.map(
          (img) =>
            new Promise<void>((resolveImg) => {
              if (img.complete) {
                resolveImg();
                return;
              }
              img.addEventListener("load", () => resolveImg(), { once: true });
              img.addEventListener("error", () => resolveImg(), { once: true });
            }),
        ),
      );
      // Give the print engine a beat to composite bitmaps.
      window.setTimeout(runPrint, 200);
    };

    if (doc.readyState === "complete") {
      void waitForReady();
    } else {
      iframe.addEventListener("load", () => void waitForReady(), { once: true });
    }
  });
}

export function buildReceiptEscPosLines(
  data: ReceiptData,
  template?: ReceiptTemplate,
): string[] {
  const biz = resolveTemplate(data, template);
  const lines: string[] = [
    biz.brandName,
    biz.brandAddress,
    biz.legalName,
    biz.companyAddress,
    `IČO: ${biz.ico}   DIČ: ${biz.dic}`,
    biz.phone,
    "--------------------------------",
    `Stůl č. ${data.tableLabel}`,
    `Doklad: ${formatReceiptDisplayIndex(data.orderNumber)}`,
    `${formatReceiptDate(data.closedAt)} ${formatReceiptTime(data.closedAt)}`,
    "--------------------------------",
    "Kód Položka                    Částka",
  ];

  for (const item of data.items) {
    lines.push(`${item.code} ${item.name}`);
    lines.push(`  ${item.quantity} ${formatReceiptAmount(item.lineTotal)} ${item.taxGroup}`);
  }

  lines.push("--------------------------------");
  lines.push(`Mezisoučet: ${formatReceiptAmount(data.subtotal)} CZK`);
  if (data.discountAmount > 0) {
    lines.push(`${data.discountLabel ?? "Sleva:"} -${formatReceiptAmount(data.discountAmount)} CZK`);
  }
  if (data.tip > 0) {
    lines.push(`Spropitné: ${formatReceiptAmount(data.tip)} CZK`);
  }
  lines.push(`CELKEM: ${formatReceiptAmount(data.grandTotal)} CZK`);
  lines.push(`Platba: ${paymentMethodLabel(data.paymentMethod)}`);
  for (const footer of biz.footerLines) {
    lines.push(footer);
  }
  return lines;
}

export async function printReceiptData(
  data: ReceiptData,
  template?: ReceiptTemplate,
  fontSettings?: ReceiptPrintFontSettings,
): Promise<void> {
  const typography = resolvePrintTypography(fontSettings);
  const bitmapTypography = fontSettings
    ? receiptBitmapTypographyFromSettings(fontSettings)
    : typography;
  const useBitmap = receiptShouldUseBitmap({
    receiptPrintBitmap: fontSettings?.receiptPrintBitmap ?? false,
    printers: fontSettings?.printers ?? [],
  });

  let receiptHtmlContent: string;
  let bitmapPngs: string[] = [];

  if (useBitmap) {
    const { buildBitmapReceiptHtml } = await import("@/src/lib/printReceiptBitmap");
    const bitmap = await buildBitmapReceiptHtml(
      data,
      template,
      bitmapTypography,
      fontSettings?.receiptFontFamily ?? "courier",
      fontSettings?.receiptFontWeight ?? "bold",
      fontSettings?.receiptFontSize,
    );
    receiptHtmlContent = bitmap.html;
    bitmapPngs = bitmap.pngs;
  } else {
    receiptHtmlContent = buildReceiptHtmlContent(data, template);
  }

  if (fontSettings?.silentPrintEnabled) {
    try {
      const { buildEscPosFromPngs, buildEscPosFromTextLines } = await import("@/src/lib/escpos");
      const {
        printerUsesLegacyBitmap,
        silentPrintEscPosPerPrinter,
      } = await import("@/src/lib/print-bridge-client");
      const bridgeSettings = {
        silentPrintEnabled: true,
        printBridgeUrl: fontSettings.printBridgeUrl ?? "http://127.0.0.1:39100",
        browserPrintFallback: fontSettings.browserPrintFallback ?? true,
        printers: fontSettings.printers ?? [],
      };
      const textBytes = buildEscPosFromTextLines(buildReceiptEscPosLines(data, template));
      let bitmapBytes: Uint8Array | null = null;

      const result = await silentPrintEscPosPerPrinter(
        bridgeSettings,
        "receipt",
        async (printer) => {
          if (!printerUsesLegacyBitmap(printer)) {
            return textBytes;
          }
          if (!bitmapBytes) {
            if (bitmapPngs.length === 0) {
              const { buildBitmapReceiptHtml } = await import("@/src/lib/printReceiptBitmap");
              const bitmap = await buildBitmapReceiptHtml(
                data,
                template,
                bitmapTypography,
                fontSettings?.receiptFontFamily ?? "courier",
                fontSettings?.receiptFontWeight ?? "bold",
                fontSettings?.receiptFontSize,
              );
              bitmapPngs = bitmap.pngs;
              receiptHtmlContent = bitmap.html;
            }
            bitmapBytes =
              bitmapPngs.length > 0
                ? await buildEscPosFromPngs(bitmapPngs, { feedBetweenDots: 0 })
                : textBytes;
          }
          return bitmapBytes;
        },
      );
      if (result.sent) return;
      console.warn("[ReceiptPrint] Silent print incomplete:", result.error);
      if (!fontSettings.browserPrintFallback) {
        throw new Error(result.error || "Silent receipt print failed");
      }
    } catch (error) {
      console.warn("[ReceiptPrint] Silent print failed:", error);
      if (fontSettings.browserPrintFallback === false) throw error;
    }
  }

  return printReceiptHTML(receiptHtmlContent, fontSettings);
}
