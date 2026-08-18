/** Standard thermal resolution used across ESC/POS raster helpers. */
export const THERMAL_DPI = 203;

/** Default receipt roll — 80 mm thermal, legacy bitmap (Old printer mode). */
export const DEFAULT_RECEIPT_PAPER_WIDTH_MM = 80;

/** ESC/POS raster width for 80 mm receipt (576 dots printable). */
export const RECEIPT_80MM_RASTER_DOTS = 576;

/**
 * ESC/POS raster line width in dots (multiple of 8). Receipt printing only.
 */
export function receiptRasterWidthDots(paperWidthMm = DEFAULT_RECEIPT_PAPER_WIDTH_MM): number {
  const mm =
    Number.isFinite(paperWidthMm) && paperWidthMm > 0
      ? paperWidthMm
      : DEFAULT_RECEIPT_PAPER_WIDTH_MM;

  if (mm <= 62) return 384;
  if (mm <= 74) return 512;
  return RECEIPT_80MM_RASTER_DOTS;
}
