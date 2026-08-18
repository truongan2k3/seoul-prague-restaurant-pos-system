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
    bodyPx: 26,
    itemPx: 30,
    metaPx: 24,
    tablePx: 24,
    titlePx: 36,
    indexPx: 38,
    celkemPx: 32,
    lineHeight: 1.15,
  },
  medium: {
    bodyPx: 28,
    itemPx: 32,
    metaPx: 26,
    tablePx: 26,
    titlePx: 40,
    indexPx: 42,
    celkemPx: 34,
    lineHeight: 1.15,
  },
  large: {
    bodyPx: 30,
    itemPx: 36,
    metaPx: 28,
    tablePx: 28,
    titlePx: 44,
    indexPx: 46,
    celkemPx: 38,
    lineHeight: 1.15,
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
