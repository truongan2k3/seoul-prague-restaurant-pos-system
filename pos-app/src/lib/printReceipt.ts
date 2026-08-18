import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  formatReceiptAmount,
  formatReceiptDate,
  formatReceiptTime,
  type ReceiptData,
} from "@/lib/receipt-calculations";
import { formatEurFromCzk } from "@/lib/currency";
import {
  DEFAULT_RECEIPT_BRANDING_VISIBILITY,
  type ReceiptBrandingVisibility,
} from "@/lib/receipt-branding";
import {
  buildThermalPrintCss,
  receiptBitmapTypographyFromSettings,
  receiptTypographyCssVars,
  receiptTypographyFromSettings,
  type ReceiptTypography,
} from "@/lib/receipt-print-styles";
import type { AppSettings } from "@/lib/types";
import { ReceiptBodyContent, type ReceiptTemplate } from "@/src/components/ReceiptPrint";
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
    paperWidthMm?: number;
  };

function resolveTemplate(data: ReceiptData, template?: ReceiptTemplate): ReceiptTemplate {
  if (template) {
    return {
      ...template,
      visibility: template.visibility ?? { ...DEFAULT_RECEIPT_BRANDING_VISIBILITY },
    };
  }
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
      visibility: { ...DEFAULT_RECEIPT_BRANDING_VISIBILITY },
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
    visibility: { ...DEFAULT_RECEIPT_BRANDING_VISIBILITY },
  };
}

function paymentMethodLabel(method: ReceiptData["paymentMethod"]): string {
  return method === "cash" ? "hotovost" : "debetní karta";
}

function padLine(left: string, right: string, width = 42): string {
  const gap = Math.max(1, width - left.length - right.length);
  return `${left}${" ".repeat(gap)}${right}`;
}

export function buildReceiptHtmlContent(data: ReceiptData, template?: ReceiptTemplate): string {
  return renderToStaticMarkup(createElement(ReceiptBodyContent, { data, template }));
}

function cssVarsInline(typography: ReceiptTypography): string {
  return Object.entries(receiptTypographyCssVars(typography))
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
}

function getOrCreatePrintIframe(): HTMLIFrameElement {
  const existing = document.getElementById(PRINT_IFRAME_ID) as HTMLIFrameElement | null;
  if (existing) existing.remove();

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
<html lang="cs" style="color-scheme: only light;">
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="only light" />
    <title>Receipt</title>
    <style>${buildThermalPrintCss(typography, paperWidthMm)}</style>
  </head>
  <body>
    <div class="receipt-inner receipt-czech receipt-sheet receipt-thermal" style="${cssVarsInline(typography)}">
      ${bodyHtml}
    </div>
  </body>
</html>`;
}

function resolvePrintTypography(fontSettings?: ReceiptPrintFontSettings): ReceiptTypography {
  if (!fontSettings) {
    return receiptTypographyFromSettings({
      receiptFontSize: "normal",
      receiptFontWeight: "normal",
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
      window.setTimeout(() => iframe.remove(), 500);
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
  const vis: ReceiptBrandingVisibility = biz.visibility;
  const lines: string[] = [];

  lines.push(padLine("", `Č.: ${data.orderNumber}`));

  if (vis.showHeaderTitle && biz.brandName.trim()) lines.push(biz.brandName);
  if (vis.showBrandAddress && biz.brandAddress.trim()) lines.push(biz.brandAddress);
  if (vis.showLegalName && biz.legalName.trim()) lines.push(biz.legalName);
  if (vis.showCompanyAddress && biz.companyAddress.trim()) lines.push(biz.companyAddress);
  if (vis.showIcoDic && (biz.ico.trim() || biz.dic.trim())) {
    lines.push(`IČO: ${biz.ico}   DIČ: ${biz.dic}`);
  }

  const telPart = vis.showPhone && biz.phone.trim() ? `Tel: ${biz.phone}` : "";
  lines.push(padLine(telPart, `Stůl č. ${data.tableLabel}`.trim()));
  lines.push(
    padLine(`Datum: ${formatReceiptDate(data.closedAt)}`, `Čas: ${formatReceiptTime(data.closedAt)}`),
  );

  lines.push("--------------------------------");
  lines.push(padLine("Kód Položka", "Částka"));

  for (const item of data.items) {
    lines.push(`${item.code} ${item.name}`);
    lines.push(padLine("", `${formatReceiptAmount(item.lineTotal)} ${item.taxGroup}`));
  }

  lines.push("--------------------------------");

  const showSubtotal =
    data.discountAmount > 0 ||
    data.tip > 0 ||
    Math.abs(data.subtotal - data.grandTotal) > 0.009;

  if (showSubtotal) {
    lines.push(padLine("Mezisoučet:", formatReceiptAmount(data.subtotal)));
  }
  if (data.discountAmount > 0) {
    lines.push(
      padLine(data.discountLabel ?? "Sleva:", formatReceiptAmount(data.discountAmount)),
    );
  }
  if (data.tip > 0) {
    lines.push(padLine("Spropitné:", formatReceiptAmount(data.tip)));
  }

  lines.push(padLine("CELKEM", formatReceiptAmount(data.grandTotal)));
  if (data.showEur && data.eurRate) {
    lines.push(`≈ ${formatEurFromCzk(data.grandTotal, data.eurRate)}`);
  }
  lines.push(
    padLine(paymentMethodLabel(data.paymentMethod), formatReceiptAmount(data.grandTotal)),
  );

  if (data.paymentMethod === "cash" && data.amountGiven != null) {
    lines.push(padLine("Přijato:", formatReceiptAmount(data.amountGiven)));
    lines.push(padLine("Vráceno:", formatReceiptAmount(data.changeDue ?? 0)));
  }

  lines.push("--------------------------------");
  lines.push(padLine("DPH", "Základ"));
  for (const row of data.taxGroups) {
    lines.push(
      padLine(
        String(row.rate),
        `${formatReceiptAmount(row.vat)}  ${formatReceiptAmount(row.base)}`,
      ),
    );
  }

  if (vis.showFooter) {
    lines.push("--------------------------------");
    for (const footer of biz.footerLines) {
      if (footer.trim()) lines.push(footer);
    }
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
      fontSettings?.receiptFontWeight ?? "normal",
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
                fontSettings?.receiptFontWeight ?? "normal",
                fontSettings?.receiptFontSize,
              );
              bitmapPngs = bitmap.pngs;
              receiptHtmlContent = bitmap.html;
            }
            bitmapBytes =
              bitmapPngs.length > 0
                ? await buildEscPosFromPngs(bitmapPngs, {
                    feedBetweenDots: 0,
                    bottomFeedLines: 3,
                  })
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
      if (!fontSettings.browserPrintFallback) throw error;
    }
  }

  await printReceiptHTML(receiptHtmlContent, fontSettings);
}
