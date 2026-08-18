/** Standard thermal resolution used across ESC/POS raster helpers. */
export const THERMAL_DPI = 203;

/** Default physical roll width for customer receipts (matches kitchen tickets). */
export const DEFAULT_RECEIPT_PAPER_WIDTH_MM = 80;

/**
 * ESC/POS raster line width in dots (multiple of 8).
 * 58 mm → 384, 72 mm → 576, 80 mm → 576 printable (~72 mm image area on 80 mm roll).
 */
export function receiptRasterWidthDots(paperWidthMm = DEFAULT_RECEIPT_PAPER_WIDTH_MM): number {
  const mm =
    Number.isFinite(paperWidthMm) && paperWidthMm > 0
      ? paperWidthMm
      : DEFAULT_RECEIPT_PAPER_WIDTH_MM;

  if (mm <= 62) return 384;
  if (mm <= 74) return 512;
  return 576;
}
