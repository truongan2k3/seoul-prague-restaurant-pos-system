import { formatEurFromCzk } from "@/lib/currency";
import {
  formatReceiptAmount,
  formatReceiptDate,
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
  blankPngDataUrl,
  ensureCjkPrintFont,
  RECEIPT_BITMAP_DPR,
  RECEIPT_BITMAP_H_PAD,
  RECEIPT_RASTER_WIDTH_PX,
  textToPngDataUrl,
  textToPngItemRowDataUrl,
  textToPngSplitRowDataUrl,
  textToPngThreeColumnDataUrl,
  textToPngTwoColumnDataUrl,
  type BitmapTextOptions,
} from "@/src/lib/printTextBitmap";

/** Match ESC/POS raster width 1:1 — avoids shrinking high-DPR PNGs on the printer. */
const FULL_WIDTH_PX = RECEIPT_RASTER_WIDTH_PX;
const FOOTER_SPACER_PX = 36;
const DIVIDER = "--------------------------------";

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

function formatCardMask(last4: string): string {
  return `**** **** **** ${last4}`;
}

type BitmapLineOpts = {
  size: number;
  weight: KitchenBitmapWeight;
  align?: "left" | "center" | "right";
  wrap?: boolean;
};

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
  const fontStack = receiptFontStack(
    fontFamily === "courier" || fontFamily === "consolas" ? "consolas" : fontFamily,
  );
  const weights = kitchenBitmapWeights(fontWeight);
  const pngs: string[] = [];
  const blocks: string[] = [];

  const baseOpts = (size: number, weight: KitchenBitmapWeight): BitmapTextOptions => ({
    maxWidthPx: FULL_WIDTH_PX,
    fontSizePx: size,
    fontWeight: weight,
    fontFamily: fontStack,
    dpr: RECEIPT_BITMAP_DPR,
    horizontalPad: RECEIPT_BITMAP_H_PAD,
    paddingY: 3,
    lineGap: 3,
  });

  const emit = (url: string, alt: string) => {
    if (!url) return;
    pngs.push(url);
    blocks.push(bitmapImgHtml(url, alt, FULL_WIDTH_PX));
  };

  const pushLine = (text: string, opts: BitmapLineOpts) => {
    if (!text.trim()) return;
    emit(
      textToPngDataUrl(text, {
        ...baseOpts(opts.size, opts.weight),
        align: opts.align ?? "left",
        wrap: opts.wrap,
      }),
      text,
    );
  };

  const pushSplit = (left: string, right: string, size: number, weight: KitchenBitmapWeight) => {
    emit(
      textToPngSplitRowDataUrl(left, right, baseOpts(size, weight)),
      `${left} ${right}`,
    );
  };

  const pushItem = (left: string, right: string, size: number, weight: KitchenBitmapWeight) => {
    emit(
      textToPngItemRowDataUrl(left, right, baseOpts(size, weight)),
      `${left} ${right}`,
    );
  };

  const pushTwoCol = (leftLines: string[], rightLines: string[], size: number, weight: KitchenBitmapWeight) => {
    emit(
      textToPngTwoColumnDataUrl(leftLines, rightLines, baseOpts(size, weight)),
      [...leftLines, ...rightLines].join(" "),
    );
  };

  const pushThreeCol = (
    left: string,
    mid: string,
    right: string,
    size: number,
    weight: KitchenBitmapWeight,
  ) => {
    emit(
      textToPngThreeColumnDataUrl(left, mid, right, baseOpts(size, weight)),
      `${left} ${mid} ${right}`,
    );
  };

  pushLine(`Č.: ${data.orderNumber}`, {
    size: typography.metaPx,
    weight: weights.secondary,
    align: "right",
    wrap: false,
  });

  if (vis.showHeaderTitle && biz.brandName.trim()) {
    pushLine(biz.brandName, {
      size: typography.titlePx,
      weight: weights.primary,
      align: "center",
      wrap: false,
    });
  }
  if (vis.showBrandAddress && biz.brandAddress.trim()) {
    pushLine(biz.brandAddress, {
      size: typography.metaPx,
      weight: weights.secondary,
      align: "center",
    });
  }
  if (vis.showLegalName && biz.legalName.trim()) {
    pushLine(biz.legalName, {
      size: typography.metaPx,
      weight: weights.secondary,
      align: "center",
    });
  }
  if (vis.showCompanyAddress && biz.companyAddress.trim()) {
    pushLine(biz.companyAddress, {
      size: typography.metaPx,
      weight: weights.secondary,
      align: "center",
    });
  }
  if (vis.showIcoDic && (biz.ico.trim() || biz.dic.trim())) {
    pushLine(`IČO: ${biz.ico}   DIČ: ${biz.dic}`, {
      size: typography.metaPx,
      weight: weights.secondary,
      align: "center",
    });
  }

  const metaLeft: string[] = [];
  if (vis.showPhone && biz.phone.trim()) metaLeft.push(`Tel: ${biz.phone}`);
  metaLeft.push(`Stůl č. ${data.tableLabel}`);
  pushTwoCol(
    metaLeft,
    [`Datum: ${formatReceiptDate(data.closedAt)}`, `Čas: ${formatReceiptTime(data.closedAt)}`],
    typography.metaPx,
    weights.secondary,
  );

  pushLine(DIVIDER, {
    size: typography.metaPx,
    weight: weights.secondary,
    align: "center",
    wrap: false,
  });

  pushSplit("Kód Položka", "Částka", typography.metaPx, weights.primary);

  for (const item of data.items) {
    const amount = `${formatReceiptAmount(item.lineTotal)} ${item.taxGroup}`;
    pushItem(`${item.code} ${item.name}`.trim(), amount, typography.metaPx, weights.secondary);
  }

  pushLine(DIVIDER, {
    size: typography.metaPx,
    weight: weights.secondary,
    align: "center",
    wrap: false,
  });

  const showSubtotal =
    data.discountAmount > 0 ||
    data.tip > 0 ||
    Math.abs(data.subtotal - data.grandTotal) > 0.009;

  if (showSubtotal) {
    pushSplit("Mezisoučet:", formatReceiptAmount(data.subtotal), typography.metaPx, weights.secondary);
  }
  if (data.discountAmount > 0) {
    pushSplit(
      data.discountLabel ?? "Sleva:",
      formatReceiptAmount(data.discountAmount),
      typography.metaPx,
      weights.secondary,
    );
  }
  if (data.tip > 0) {
    pushSplit("Spropitné:", formatReceiptAmount(data.tip), typography.metaPx, weights.secondary);
  }

  pushSplit("CELKEM", formatReceiptAmount(data.grandTotal), typography.celkemPx, weights.primary);

  if (data.showEur && data.eurRate) {
    pushLine(`≈ ${formatEurFromCzk(data.grandTotal, data.eurRate)}`, {
      size: typography.metaPx,
      weight: weights.secondary,
      align: "center",
      wrap: false,
    });
  }

  pushSplit(
    paymentMethodLabel(data.paymentMethod),
    formatReceiptAmount(data.grandTotal),
    typography.metaPx,
    weights.secondary,
  );

  if (data.paymentMethod === "cash" && data.amountGiven != null) {
    pushSplit("Přijato:", formatReceiptAmount(data.amountGiven), typography.metaPx, weights.secondary);
    pushSplit(
      "Vráceno:",
      formatReceiptAmount(data.changeDue ?? 0),
      typography.metaPx,
      weights.primary,
    );
  }

  if (data.paymentMethod === "card" && data.cardLast4) {
    pushLine(DIVIDER, {
      size: typography.metaPx,
      weight: weights.secondary,
      align: "center",
      wrap: false,
    });
    pushLine("PLATBA KARTOU / CARD PAYMENT", {
      size: typography.itemPx,
      weight: weights.primary,
      align: "center",
      wrap: false,
    });
    pushLine(
      `Karta: ${data.cardBrand ?? "Card"} (${formatCardMask(data.cardLast4)})`,
      { size: typography.metaPx, weight: weights.secondary, align: "center" },
    );
    if (data.cardAuthCode) {
      pushLine(`Auth Code: ${data.cardAuthCode}`, {
        size: typography.metaPx,
        weight: weights.secondary,
        align: "center",
      });
    }
    pushLine("Trans. Status: SCHVÁLENO / APPROVED", {
      size: typography.metaPx,
      weight: weights.secondary,
      align: "center",
    });
  }

  pushLine(DIVIDER, {
    size: typography.metaPx,
    weight: weights.secondary,
    align: "center",
    wrap: false,
  });

  pushThreeCol("", "DPH", "Základ", typography.tablePx, weights.primary);
  for (const row of data.taxGroups) {
    pushThreeCol(
      String(row.rate),
      formatReceiptAmount(row.vat),
      formatReceiptAmount(row.base),
      typography.tablePx,
      weights.secondary,
    );
  }

  if (vis.showFooter) {
    for (const line of biz.footerLines) {
      pushLine(line, {
        size: typography.metaPx,
        weight: weights.secondary,
        align: "center",
      });
    }
  }

  emit(
    blankPngDataUrl(FULL_WIDTH_PX, FOOTER_SPACER_PX, RECEIPT_BITMAP_DPR),
    "footer-spacer",
  );

  const html = `<div class="receipt-bitmap">${blocks.join("")}</div>`;
  return { html, pngs };
}
