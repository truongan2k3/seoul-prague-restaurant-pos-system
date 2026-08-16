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
  receiptFontStack,
  type KitchenBitmapWeight,
  type ReceiptTypography,
} from "@/lib/receipt-print-styles";
import type { ReceiptFontFamily, ReceiptFontWeight } from "@/lib/types";
import type { ReceiptTemplate } from "@/src/components/ReceiptPrint";
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
  };
  const url = textToPngDataUrl(text, bitmapOpts);
  if (url) pngs.push(url);
  return bitmapImgHtml(url, text, opts.width);
}

function gap(): string {
  return '<div class="receipt-bitmap-gap"></div>';
}

/** Rasterize receipt lines so legacy thermal printers receive images, not font glyphs. */
export async function buildBitmapReceiptHtml(
  data: ReceiptData,
  template: ReceiptTemplate | undefined,
  typography: ReceiptTypography,
  fontFamily: ReceiptFontFamily,
  fontWeight: ReceiptFontWeight,
): Promise<{ html: string; pngs: string[] }> {
  await ensureCjkPrintFont();

  const biz = resolveTemplate(data, template);
  const displayIndex = formatReceiptDisplayIndex(data.orderNumber);
  const fontStack = receiptFontStack(fontFamily);
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

  push(displayIndex, typography.indexPx, weights.primary, "center");
  push(`Č.: ${data.orderNumber}`, typography.metaPx, weights.secondary, "center");
  push(biz.brandName, typography.titlePx, weights.primary, "center");
  for (const line of [biz.brandAddress, biz.legalName, biz.companyAddress]) {
    push(line, typography.metaPx, weights.secondary, "center");
  }
  push(`IČO: ${biz.ico}   DIČ: ${biz.dic}`, typography.metaPx, weights.secondary, "center");

  const metaLeft = [
    bmp(`Tel: ${biz.phone}`, { width: HALF_WIDTH_PX, size: typography.metaPx, weight: weights.secondary }, fontStack, pngs),
    bmp(`Stůl č. ${data.tableLabel}`, { width: HALF_WIDTH_PX, size: typography.metaPx, weight: weights.secondary }, fontStack, pngs),
  ].join("");
  const metaRight = [
    bmp(`Datum: ${formatReceiptDate(data.closedAt)}`, { width: HALF_WIDTH_PX, size: typography.metaPx, weight: weights.secondary, align: "left" }, fontStack, pngs),
    bmp(`Čas: ${formatReceiptTime(data.closedAt)}`, { width: HALF_WIDTH_PX, size: typography.metaPx, weight: weights.secondary, align: "left" }, fontStack, pngs),
  ].join("");
  blocks.push(
    `<div class="receipt-bitmap-row"><div class="receipt-bitmap-col">${metaLeft}</div><div class="receipt-bitmap-col">${metaRight}</div></div>`,
  );

  blocks.push(gap(), bmp(DIVIDER, { width: FULL_WIDTH_PX, size: typography.metaPx, weight: weights.secondary, align: "center" }, fontStack, pngs), gap());

  const headLeft = bmp("Kód Položka", { width: HALF_WIDTH_PX, size: typography.itemPx, weight: weights.primary }, fontStack, pngs);
  const headRight = bmp("Částka", { width: HALF_WIDTH_PX, size: typography.itemPx, weight: weights.primary, align: "left" }, fontStack, pngs);
  blocks.push(`<div class="receipt-bitmap-row">${headLeft}${headRight}</div>`);

  for (const item of data.items) {
    push(`${item.code} ${item.name}`, typography.itemPx, weights.primary);
    push(
      `${item.quantity} ${formatReceiptAmount(item.lineTotal)} ${item.taxGroup}`,
      typography.itemPx,
      weights.primary,
      "left",
      FULL_WIDTH_PX,
    );
  }

  blocks.push(gap(), bmp(DIVIDER, { width: FULL_WIDTH_PX, size: typography.metaPx, weight: weights.secondary, align: "center" }, fontStack, pngs), gap());

  const totalLeft = bmp("Mezisoučet:", { width: HALF_WIDTH_PX, size: typography.bodyPx, weight: weights.secondary }, fontStack, pngs);
  const totalRight = bmp(`${formatReceiptAmount(data.subtotal)} CZK`, { width: HALF_WIDTH_PX, size: typography.bodyPx, weight: weights.secondary, align: "left" }, fontStack, pngs);
  blocks.push(`<div class="receipt-bitmap-row">${totalLeft}${totalRight}</div>`);

  if (data.discountAmount > 0) {
    const discountLeft = bmp(data.discountLabel ?? "Sleva:", { width: HALF_WIDTH_PX, size: typography.bodyPx, weight: weights.secondary }, fontStack, pngs);
    const discountRight = bmp(`${formatReceiptAmount(data.discountAmount)} CZK`, { width: HALF_WIDTH_PX, size: typography.bodyPx, weight: weights.secondary, align: "left" }, fontStack, pngs);
    blocks.push(`<div class="receipt-bitmap-row">${discountLeft}${discountRight}</div>`);
  }

  const celkemLeft = bmp("CELKEM", { width: HALF_WIDTH_PX, size: typography.celkemPx, weight: weights.primary }, fontStack, pngs);
  const celkemRight = bmp(`${formatReceiptAmount(data.grandTotal)} CZK`, { width: HALF_WIDTH_PX, size: typography.celkemPx, weight: weights.primary, align: "left" }, fontStack, pngs);
  blocks.push(`<div class="receipt-bitmap-row">${celkemLeft}${celkemRight}</div>`);

  if (data.showEur && data.eurRate) {
    push(`≈ ${formatEurFromCzk(data.grandTotal, data.eurRate)}`, typography.metaPx, weights.secondary, "center");
  }

  push(paymentMethodLabel(data.paymentMethod), typography.metaPx, weights.secondary, "center");

  if (data.paymentMethod === "cash" && data.amountGiven != null) {
    const givenLeft = bmp("Přijato:", { width: HALF_WIDTH_PX, size: typography.metaPx, weight: weights.secondary }, fontStack, pngs);
    const givenRight = bmp(`${formatReceiptAmount(data.amountGiven)} CZK`, { width: HALF_WIDTH_PX, size: typography.metaPx, weight: weights.secondary, align: "left" }, fontStack, pngs);
    blocks.push(`<div class="receipt-bitmap-row">${givenLeft}${givenRight}</div>`);
    const changeLeft = bmp("Vráceno:", { width: HALF_WIDTH_PX, size: typography.metaPx, weight: weights.primary }, fontStack, pngs);
    const changeRight = bmp(`${formatReceiptAmount(data.changeDue ?? 0)} CZK`, { width: HALF_WIDTH_PX, size: typography.metaPx, weight: weights.primary, align: "left" }, fontStack, pngs);
    blocks.push(`<div class="receipt-bitmap-row">${changeLeft}${changeRight}</div>`);
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

  blocks.push(gap());
  for (const line of biz.footerLines) {
    push(line, typography.metaPx, weights.secondary, "center");
  }

  const html = `<div class="receipt-bitmap">${blocks.join("")}</div>`;
  return { html, pngs };
}
