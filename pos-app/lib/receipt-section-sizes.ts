/** Relative size multiplier for one receipt section (on top of the global preset). */
export type ReceiptSectionSizeScale = 0.75 | 1 | 1.25 | 1.5;

export type ReceiptSectionKey =
  | "header"
  | "meta"
  | "items"
  | "totals"
  | "celkem"
  | "vat"
  | "footer";

export type ReceiptSectionSizes = Record<ReceiptSectionKey, ReceiptSectionSizeScale>;

export const RECEIPT_SECTION_KEYS: ReceiptSectionKey[] = [
  "header",
  "meta",
  "items",
  "totals",
  "celkem",
  "vat",
  "footer",
];

export const RECEIPT_SECTION_SIZE_SCALES: ReceiptSectionSizeScale[] = [0.75, 1, 1.25, 1.5];

export const DEFAULT_RECEIPT_SECTION_SIZES: ReceiptSectionSizes = {
  header: 1,
  meta: 1,
  items: 1,
  totals: 1,
  celkem: 1.25,
  vat: 1,
  footer: 1,
};

function parseScale(value: unknown, fallback: ReceiptSectionSizeScale): ReceiptSectionSizeScale {
  const num = typeof value === "number" ? value : Number(value);
  return RECEIPT_SECTION_SIZE_SCALES.includes(num as ReceiptSectionSizeScale)
    ? (num as ReceiptSectionSizeScale)
    : fallback;
}

/** Merge partial / DB JSON into a full section-size map. */
export function parseReceiptSectionSizes(value: unknown): ReceiptSectionSizes {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_RECEIPT_SECTION_SIZES };
  }
  const row = value as Record<string, unknown>;
  const out = { ...DEFAULT_RECEIPT_SECTION_SIZES };
  for (const key of RECEIPT_SECTION_KEYS) {
    out[key] = parseScale(row[key], DEFAULT_RECEIPT_SECTION_SIZES[key]);
  }
  return out;
}

export function scaleReceiptPx(basePx: number, scale: ReceiptSectionSizeScale): number {
  return Math.max(8, Math.round(basePx * scale));
}
