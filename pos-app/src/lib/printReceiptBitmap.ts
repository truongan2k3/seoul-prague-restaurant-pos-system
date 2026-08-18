import { formatEurFromCzk } from "@/lib/currency";
import {
  formatReceiptAmount,
  formatReceiptDate,
  formatReceiptDisplayIndex,
  formatReceiptTime,
  type ReceiptData,
} from "@/lib/receipt-calculations";
import {
  kitchenBitmapWeights,
  receiptBitmapTypographyFromSettings,
  receiptFontStack,
  type KitchenBitmapWeight,
  type ReceiptTypography,
} from "@/lib/receipt-print-styles";
import type { AppSettings, ReceiptFontFamily, ReceiptFontWeight } from "@/lib/types";
import type { ReceiptTemplate } from "@/src/components/ReceiptPrint";
import { DEFAULT_RECEIPT_BRANDING_VISIBILITY } from "@/lib/receipt-branding";
import {
  bitmapImgHtml,
  ensureCjkPrintFont,
  textToPngDataUrl,
  type BitmapTextOptions,
} from "@/src/lib/printTextBitmap";

/** Content width for 72mm receipt paper (~2mm margins). */
const FULL_WIDTH_PX = 520;
const HALF_WIDTH_PX = 250;
const DIVIDER = "--------------------------------";

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

function formatCardMask(last4: string): string {
  return `**** **** **** ${last4}`;
}

function bmp(
  text: string,
  opts: {
    width: number;
    size: number;
    weight?: KitchenBitmapWeight;
    align?: "left" | "center";
  },
  fontFamily: string,
  pngs: string[],
): string {
  const bitmapOpts: BitmapTextOptions = {
    maxWidthPx: opts.width,
    fontSizePx: opts.size,
    fontWeight: opts.weight ?? 700,
    align: opts.align ?? "left",
    fontFamily,
    dpr: 2,
    paddingY: 1,
    lineGap: 2,
  };
  const url = textToPngDataUrl(text, bitmapOpts);
  if (url) pngs.push(url);
  return bitmapImgHtml(url, text, opts.width);
}

function gap(size: "sm" | "md" = "sm"): string {
  const height = size === "md" ? 4 : 2;
  return `<div class="receipt-bitmap-gap" style="height:${height}px"></div>`;
}

function rowPair(
  left: string,
  right: string,
  size: number,
  weight: KitchenBitmapWeight,
  fontStack: string,
  pngs: string[],
): string {
  const leftHtml = bmp(left, { width: HALF_WIDTH_PX, size, weight }, fontStack, pngs);
  const rightHtml = bmp(
    right,
    { width: HALF_WIDTH_PX, size, weight, align: "left" },
    fontStack,
    pngs,
  );
  return `<div class="receipt-bitmap-row">${leftHtml}${rightHtml}</div>`;
}

/** Rasterize receipt lines so legacy thermal printers receive images, not font glyphs. */
export async function buildBitmapReceiptHtml(
  data: ReceiptData,
  template: ReceiptTemplate | undefined,
  typographyInput: ReceiptTypography,
  fontFamily: ReceiptFontFamily,
  fontWeight: ReceiptFontWeight,
  fontSize?: AppSettings["receiptFontSize"],
): Promise<{ html: string; pngs: string[] }> {
  await ensureCjkPrintFont();

  const typography =
    fontSize != null
      ? receiptBitmapTypographyFromSettings({
          receiptFontSize: fontSize,
          receiptFontWeight: fontWeight,
          receiptFontFamily: fontFamily,
        })
      : typographyInput;

  const biz = resolveTemplate(data, template);
  const vis = biz.visibility;
  const fontStack = receiptFontStack(fontFamily === "courier" ? "arial" : fontFamily);
  const weights = kitchenBitmapWeights(fontWeight);
  const pngs: string[] = [];
  const blocks: string[] = [];

  const push = (
    text: string,
    size: number,
    weight: KitchenBitmapWeight = weights.primary,
    align: "left" | "center" = "left",
    width = FULL_WIDTH_PX,
  ) => {
    if (!text.trim()) return;
    blocks.push(bmp(text, { width, size, weight, align }, fontStack, pngs));
  };

  push(`Č.: ${data.orderNumber}`, typography.metaPx, weights.secondary, "center");
  if (vis.showHeaderTitle) push(biz.brandName, typography.titlePx, weights.primary, "center");
  if (vis.showBrandAddress) push(biz.brandAddress, typography.metaPx, weights.secondary, "center");
  if (vis.showLegalName) push(biz.legalName, typography.metaPx, weights.secondary, "center");
  if (vis.showCompanyAddress) push(biz.companyAddress, typography.metaPx, weights.secondary, "center");
  if (vis.showIcoDic) {
    push(`IČO: ${biz.ico}   DIČ: ${biz.dic}`, typography.metaPx, weights.secondary, "center");
  }

  const metaLeft = [
    vis.showPhone && biz.phone.trim()
      ? bmp(`Tel: ${biz.phone}`, { width: HALF_WIDTH_PX, size: typography.metaPx, weight: weights.secondary }, fontStack, pngs)
      : "",
    bmp(`Stůl č. ${data.tableLabel}`, { width: HALF_WIDTH_PX, size: typography.metaPx, weight: weights.secondary }, fontStack, pngs),
  ].join("");
  const metaRight = [
    bmp(`Datum: ${formatReceiptDate(data.closedAt)}`, { width: HALF_WIDTH_PX, size: typography.metaPx, weight: weights.secondary }, fontStack, pngs),
    bmp(`Čas: ${formatReceiptTime(data.closedAt)}`, { width: HALF_WIDTH_PX, size: typography.metaPx, weight: weights.secondary }, fontStack, pngs),
  ].join("");
  blocks.push(
    `<div class="receipt-bitmap-row"><div class="receipt-bitmap-col">${metaLeft}</div><div class="receipt-bitmap-col">${metaRight}</div></div>`,
  );

  blocks.push(gap(), bmp(DIVIDER, { width: FULL_WIDTH_PX, size: typography.metaPx, weight: weights.secondary, align: "center" }, fontStack, pngs), gap());

  blocks.push(
    rowPair("Kód Položka", "Částka", typography.itemPx, weights.primary, fontStack, pngs),
  );

  for (const item of data.items) {
    blocks.push(
      rowPair(
        `${item.code} ${item.name}`,
        `${formatReceiptAmount(item.lineTotal)} ${item.taxGroup}`,
        typography.itemPx,
        weights.primary,
        fontStack,
        pngs,
      ),
    );
  }

  blocks.push(gap(), bmp(DIVIDER, { width: FULL_WIDTH_PX, size: typography.metaPx, weight: weights.secondary, align: "center" }, fontStack, pngs), gap());

  const showSubtotal =
    data.discountAmount > 0 ||
    data.tip > 0 ||
    Math.abs(data.subtotal - data.grandTotal) > 0.009;

  if (showSubtotal) {
    blocks.push(
      rowPair(
        "Mezisoučet:",
        formatReceiptAmount(data.subtotal),
        typography.bodyPx,
        weights.secondary,
        fontStack,
        pngs,
      ),
    );
  }

  if (data.discountAmount > 0) {
    blocks.push(
      rowPair(
        data.discountLabel ?? "Sleva:",
        `${formatReceiptAmount(data.discountAmount)} CZK`,
        typography.bodyPx,
        weights.secondary,
        fontStack,
        pngs,
      ),
    );
  }

  blocks.push(
    rowPair(
      "CELKEM",
      formatReceiptAmount(data.grandTotal),
      typography.celkemPx,
      weights.primary,
      fontStack,
      pngs,
    ),
  );

  if (data.showEur && data.eurRate) {
    push(`≈ ${formatEurFromCzk(data.grandTotal, data.eurRate)}`, typography.metaPx, weights.secondary, "center");
  }

  blocks.push(
    rowPair(
      paymentMethodLabel(data.paymentMethod),
      formatReceiptAmount(data.grandTotal),
      typography.metaPx,
      weights.secondary,
      fontStack,
      pngs,
    ),
  );

  if (data.paymentMethod === "cash" && data.amountGiven != null) {
    blocks.push(
      rowPair(
        "Přijato:",
        `${formatReceiptAmount(data.amountGiven)} CZK`,
        typography.metaPx,
        weights.secondary,
        fontStack,
        pngs,
      ),
      rowPair(
        "Vráceno:",
        `${formatReceiptAmount(data.changeDue ?? 0)} CZK`,
        typography.metaPx,
        weights.primary,
        fontStack,
        pngs,
      ),
    );
  }

  if (data.paymentMethod === "card" && data.cardLast4) {
    blocks.push(gap(), bmp(DIVIDER, { width: FULL_WIDTH_PX, size: typography.metaPx, weight: weights.secondary, align: "center" }, fontStack, pngs), gap());
    push("PLATBA KARTOU / CARD PAYMENT", typography.itemPx, weights.primary, "center");
    push(
      `Karta: ${data.cardBrand ?? "Card"} (${formatCardMask(data.cardLast4)})`,
      typography.metaPx,
      weights.secondary,
      "center",
    );
    if (data.cardAuthCode) {
      push(`Auth Code: ${data.cardAuthCode}`, typography.metaPx, weights.secondary, "center");
    }
    push("Trans. Status: SCHVÁLENO / APPROVED", typography.metaPx, weights.secondary, "center");
  }

  blocks.push(gap(), bmp(DIVIDER, { width: FULL_WIDTH_PX, size: typography.metaPx, weight: weights.secondary, align: "center" }, fontStack, pngs), gap());

  push("Rate (%)    DPH    Základ", typography.tablePx, weights.primary, "center");
  for (const row of data.taxGroups) {
    push(
      `${row.rate}%    ${formatReceiptAmount(row.vat)}    ${formatReceiptAmount(row.base)}`,
      typography.tablePx,
      weights.secondary,
      "center",
    );
  }

  blocks.push(gap("md"));
  if (vis.showFooter) {
    for (const line of biz.footerLines) {
      push(line, typography.metaPx, weights.secondary, "center");
    }
  }

  const html = `<div class="receipt-bitmap">${blocks.join("")}</div>`;
  return { html, pngs };
}
