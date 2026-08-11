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
  receiptTypographyFromSettings,
  type ReceiptTypography,
} from "@/lib/receipt-print-styles";
import type { AppSettings } from "@/lib/types";
import type { ReceiptTemplate } from "@/src/components/ReceiptPrint";

const PRINT_IFRAME_ID = "receipt-print-iframe";

export type ReceiptPrintFontSettings = Pick<
  AppSettings,
  "receiptFontSize" | "receiptFontWeight" | "receiptFontFamily"
>;

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
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";
  iframe.style.colorScheme = "only light";
  document.body.appendChild(iframe);
  return iframe;
}

function buildPrintDocument(bodyHtml: string, typography: ReceiptTypography): string {
  return `<!DOCTYPE html>
<html lang="zh-CN" style="color-scheme: only light;">
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="only light" />
    <title>Receipt</title>
    <style>${buildThermalPrintCss(typography)}</style>
  </head>
  <body>${bodyHtml}</body>
</html>`;
}

function resolvePrintTypography(fontSettings?: ReceiptPrintFontSettings): ReceiptTypography {
  if (!fontSettings) {
    return receiptTypographyFromSettings({
      receiptFontSize: "medium",
      receiptFontWeight: "bold",
      receiptFontFamily: "consolas",
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

    doc.open();
    doc.write(buildPrintDocument(receiptHtmlContent, typography));
    doc.close();

    const waitForReady = () => {
      const images = doc.images;
      if (images.length === 0) {
        window.setTimeout(runPrint, 150);
        return;
      }

      let loaded = 0;
      const onImageDone = () => {
        loaded += 1;
        if (loaded >= images.length) {
          window.setTimeout(runPrint, 100);
        }
      };

      for (let i = 0; i < images.length; i += 1) {
        const img = images[i];
        if (img.complete) {
          onImageDone();
        } else {
          img.addEventListener("load", onImageDone);
          img.addEventListener("error", onImageDone);
        }
      }
    };

    if (doc.readyState === "complete") {
      waitForReady();
    } else {
      iframe.addEventListener("load", waitForReady, { once: true });
    }
  });
}

export function printReceiptData(
  data: ReceiptData,
  template?: ReceiptTemplate,
  fontSettings?: ReceiptPrintFontSettings,
): Promise<void> {
  return printReceiptHTML(buildReceiptHtmlContent(data, template), fontSettings);
}
