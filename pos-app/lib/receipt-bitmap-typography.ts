import {
  receiptFontStack,
  receiptTypographyFromSettings,
  type ReceiptTypography,
} from "@/lib/receipt-print-styles";
import type { AppSettings } from "@/lib/types";

/**
 * Receipt-only bitmap font sizes (80 mm + Old printer / legacy bitmap).
 * Kitchen and bar tickets use their own scales in printKitchenTicket.ts — do not reuse here.
 */
const RECEIPT_BITMAP_SIZE_SCALE: Record<
  AppSettings["receiptFontSize"],
  Pick<
    ReceiptTypography,
    "bodyPx" | "itemPx" | "metaPx" | "tablePx" | "titlePx" | "indexPx" | "celkemPx" | "lineHeight"
  >
> = {
  normal: {
    bodyPx: 20,
    itemPx: 20,
    metaPx: 20,
    tablePx: 20,
    titlePx: 24,
    indexPx: 24,
    celkemPx: 22,
    lineHeight: 1.12,
  },
  medium: {
    bodyPx: 22,
    itemPx: 22,
    metaPx: 22,
    tablePx: 22,
    titlePx: 26,
    indexPx: 26,
    celkemPx: 24,
    lineHeight: 1.12,
  },
  large: {
    bodyPx: 24,
    itemPx: 24,
    metaPx: 24,
    tablePx: 24,
    titlePx: 28,
    indexPx: 28,
    celkemPx: 26,
    lineHeight: 1.12,
  },
};

/** Typography for legacy bitmap receipt printing only. */
export function receiptBitmapTypographyFromSettings(
  settings: Pick<AppSettings, "receiptFontSize" | "receiptFontWeight" | "receiptFontFamily">,
): ReceiptTypography {
  const base = receiptTypographyFromSettings(settings);
  const size =
    RECEIPT_BITMAP_SIZE_SCALE[settings.receiptFontSize] ?? RECEIPT_BITMAP_SIZE_SCALE.medium;
  return {
    ...base,
    fontFamily: receiptFontStack(
      settings.receiptFontFamily === "courier" || settings.receiptFontFamily === "consolas"
        ? "consolas"
        : settings.receiptFontFamily,
    ),
    ...size,
  };
}
