/** Standard thermal resolution used across ESC/POS raster helpers. */
export const THERMAL_DPI = 203;

/** Default receipt roll — 80 mm thermal, legacy bitmap (Old printer mode). */
export const DEFAULT_RECEIPT_PAPER_WIDTH_MM = 80;

/** ESC/POS raster width for 80 mm receipt (576 dots printable). */
export const RECEIPT_80MM_RASTER_DOTS = 576;

/**
 * Receipt-only blank ahead of the cutter (print head → blade gap).
 * ~6 mm @ 203 dpi — kitchen/bar use their own clip-bottom setting.
 */
export const RECEIPT_CUT_BOTTOM_BLANK_DOTS = 48;

/**
 * Extra ESC/POS line feeds after the blank raster, before cut (receipt only).
 * Keep a ~1-line gap under the footer so the blade does not hug the last text.
 */
export const RECEIPT_CUT_BOTTOM_FEED_LINES = 3;

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
