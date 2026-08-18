import type { AppSettings, ReceiptFontFamily, ReceiptFontSize, ReceiptFontWeight } from "@/lib/types";

export interface ReceiptFontOption {
  id: ReceiptFontFamily;
  stack: string;
  sample: string;
}

/** CJK-capable stack with Latin first so print engines always have a solid face. */
const CJK_FONT_FALLBACK =
  "Arial, Helvetica, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Heiti SC', 'Microsoft YaHei', 'Noto Sans SC', 'Source Han Sans SC', sans-serif";

/** System font stacks — Latin primary + CJK fallbacks for bilingual kitchen tickets. */
export const RECEIPT_FONT_OPTIONS: ReceiptFontOption[] = [
  {
    id: "consolas",
    stack: `Consolas, 'Lucida Console', 'Courier New', monospace, ${CJK_FONT_FALLBACK}`,
    sample: "Consolas",
  },
  {
    id: "courier",
    stack: `'Courier New', Courier, monospace, ${CJK_FONT_FALLBACK}`,
    sample: "Courier New",
  },
  {
    id: "arial",
    stack: CJK_FONT_FALLBACK,
    sample: "Arial",
  },
  {
    id: "tahoma",
    stack: `Tahoma, Verdana, ${CJK_FONT_FALLBACK}`,
    sample: "Tahoma",
  },
  {
    id: "lucida",
    stack: `'Lucida Sans', 'Lucida Grande', 'Lucida Sans Unicode', ${CJK_FONT_FALLBACK}`,
    sample: "Lucida Sans",
  },
  {
    id: "georgia",
    stack: `Georgia, 'Times New Roman', Times, ${CJK_FONT_FALLBACK}`,
    sample: "Georgia",
  },
];

export const KITCHEN_TICKET_FONT_STACK = CJK_FONT_FALLBACK;

export interface ReceiptTypography {
  fontFamily: string;
  bodyPx: number;
  itemPx: number;
  metaPx: number;
  tablePx: number;
  titlePx: number;
  indexPx: number;
  celkemPx: number;
  bodyWeight: number;
  itemWeight: number;
  lineHeight: number;
}

const SIZE_SCALE: Record<
  ReceiptFontSize,
  Pick<ReceiptTypography, "bodyPx" | "itemPx" | "metaPx" | "tablePx" | "titlePx" | "indexPx" | "celkemPx" | "lineHeight">
> = {
  normal: {
    bodyPx: 20,
    itemPx: 20,
    metaPx: 18,
    tablePx: 18,
    titlePx: 26,
    indexPx: 28,
    celkemPx: 24,
    lineHeight: 1.2,
  },
  medium: {
    bodyPx: 22,
    itemPx: 22,
    metaPx: 20,
    tablePx: 20,
    titlePx: 28,
    indexPx: 30,
    celkemPx: 26,
    lineHeight: 1.22,
  },
  large: {
    bodyPx: 24,
    itemPx: 24,
    metaPx: 22,
    tablePx: 22,
    titlePx: 30,
    indexPx: 32,
    celkemPx: 28,
    lineHeight: 1.22,
  },
};

const WEIGHT_SCALE: Record<ReceiptFontWeight, Pick<ReceiptTypography, "bodyWeight" | "itemWeight">> = {
  normal: { bodyWeight: 400, itemWeight: 600 },
  semibold: { bodyWeight: 600, itemWeight: 700 },
  bold: { bodyWeight: 700, itemWeight: 700 },
  extrabold: { bodyWeight: 800, itemWeight: 800 },
};

export type KitchenBitmapWeight = 400 | 600 | 700;

function capBitmapWeight(weight: number): KitchenBitmapWeight {
  if (weight <= 450) return 400;
  if (weight <= 650) return 600;
  return 700;
}

/** Primary (large) and secondary (small) weights for kitchen ticket bitmap text. */
export function kitchenBitmapWeights(
  weight: ReceiptFontWeight,
): { primary: KitchenBitmapWeight; secondary: KitchenBitmapWeight } {
  const scale = WEIGHT_SCALE[weight] ?? WEIGHT_SCALE.bold;
  const primary = capBitmapWeight(scale.itemWeight);
  const rawSecondary =
    scale.bodyWeight < scale.itemWeight
      ? scale.bodyWeight
      : Math.max(400, scale.itemWeight - 100);
  return {
    primary,
    secondary: capBitmapWeight(rawSecondary),
  };
}

const FONT_STACK: Record<ReceiptFontFamily, string> = Object.fromEntries(
  RECEIPT_FONT_OPTIONS.map((option) => [option.id, option.stack]),
) as Record<ReceiptFontFamily, string>;

export function parseReceiptFontSize(value: string | null | undefined): ReceiptFontSize {
  if (value === "normal" || value === "medium" || value === "large") return value;
  return "medium";
}

export function parseReceiptFontWeight(value: string | null | undefined): ReceiptFontWeight {
  if (
    value === "normal" ||
    value === "semibold" ||
    value === "bold" ||
    value === "extrabold"
  ) {
    return value;
  }
  return "bold";
}

export function parseReceiptFontFamily(value: string | null | undefined): ReceiptFontFamily {
  if (
    value === "courier" ||
    value === "consolas" ||
    value === "arial" ||
    value === "tahoma" ||
    value === "georgia" ||
    value === "lucida"
  ) {
    return value;
  }
  return "courier";
}

export function receiptFontStack(family: ReceiptFontFamily): string {
  return FONT_STACK[family] ?? FONT_STACK.consolas;
}

export function receiptTypographyFromSettings(
  settings: Pick<AppSettings, "receiptFontSize" | "receiptFontWeight" | "receiptFontFamily">,
): ReceiptTypography {
  const size = SIZE_SCALE[settings.receiptFontSize] ?? SIZE_SCALE.medium;
  const weight = WEIGHT_SCALE[settings.receiptFontWeight] ?? WEIGHT_SCALE.bold;
  return {
    fontFamily: receiptFontStack(settings.receiptFontFamily),
    ...size,
    ...weight,
  };
}

/** Bitmap receipt fonts — tuned for ~576-dot thermal (similar density to kitchen tickets). */
const BITMAP_SIZE_SCALE: Record<
  ReceiptFontSize,
  Pick<ReceiptTypography, "bodyPx" | "itemPx" | "metaPx" | "tablePx" | "titlePx" | "indexPx" | "celkemPx" | "lineHeight">
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

export function receiptBitmapTypographyFromSettings(
  settings: Pick<AppSettings, "receiptFontSize" | "receiptFontWeight" | "receiptFontFamily">,
): ReceiptTypography {
  const base = receiptTypographyFromSettings(settings);
  const size = BITMAP_SIZE_SCALE[settings.receiptFontSize] ?? BITMAP_SIZE_SCALE.medium;
  return { ...base, ...size };
}

export function receiptTypographyCssVars(
  typography: ReceiptTypography,
): Record<string, string | number> {
  return {
    "--receipt-font-family": typography.fontFamily,
    "--receipt-body-size": `${typography.bodyPx}px`,
    "--receipt-item-size": `${typography.itemPx}px`,
    "--receipt-meta-size": `${typography.metaPx}px`,
    "--receipt-table-size": `${typography.tablePx}px`,
    "--receipt-title-size": `${typography.titlePx}px`,
    "--receipt-index-size": `${typography.indexPx}px`,
    "--receipt-celkem-size": `${typography.celkemPx}px`,
    "--receipt-body-weight": typography.bodyWeight,
    "--receipt-item-weight": typography.itemWeight,
    "--receipt-line-height": typography.lineHeight,
  };
}

export function buildThermalPrintCss(
  typography: ReceiptTypography,
  paperWidthMm: number = 80,
): string {
  const width = Number.isFinite(paperWidthMm) && paperWidthMm > 0 ? paperWidthMm : 80;
  return `
  @page {
    size: ${width}mm auto;
    margin: 0mm;
  }
  * {
    box-sizing: border-box;
  }
  :root, html {
    color-scheme: only light;
  }
  html, body {
    width: ${width}mm;
    margin: 0;
    padding: 0;
    background: #fff !important;
    color: #000 !important;
    color-scheme: only light;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    padding: 2mm;
    font-family: ${typography.fontFamily};
    font-size: ${typography.bodyPx}px;
    font-weight: ${typography.bodyWeight};
    line-height: ${typography.lineHeight};
    -webkit-font-smoothing: none;
    -moz-osx-font-smoothing: unset;
    text-rendering: optimizeSpeed;
    background: #fff !important;
    color: #000 !important;
  }
  /* Dark-mode parents can invert iframe print text — force ink black. */
  body, body * {
    color: #000 !important;
    -webkit-text-fill-color: #000 !important;
  }
  img {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    max-width: 100%;
  }
  .text-center { text-align: center; }
  .text-right { text-align: right; }
  .flex-between { display: flex; justify-content: space-between; gap: 4px; }
  .bold { font-weight: ${typography.itemWeight}; }
  .divider {
    border: 0;
    border-bottom: 2px dashed #000;
    margin: 8px 0;
    height: 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: ${typography.tablePx}px;
    font-weight: ${typography.itemWeight};
    font-family: ${typography.fontFamily};
  }
  th, td { padding: 2px 0; color: #000; }
  .receipt-index {
    font-size: ${typography.indexPx}px;
    font-weight: ${typography.itemWeight};
    margin: 0 0 4px;
    text-align: center;
    letter-spacing: 0.02em;
  }
  .receipt-title {
    font-size: ${typography.titlePx}px;
    font-weight: ${typography.itemWeight};
    margin: 4px 0;
    letter-spacing: 0.04em;
  }
  .receipt-meta-row {
    display: flex;
    justify-content: space-between;
    font-size: ${typography.metaPx}px;
    font-weight: ${typography.bodyWeight};
    margin-top: 6px;
  }
  .receipt-meta-col { display: flex; flex-direction: column; gap: 2px; }
  .receipt-meta-right { text-align: right; }
  .receipt-items-head {
    display: flex;
    justify-content: space-between;
    font-weight: ${typography.itemWeight};
    font-size: ${typography.itemPx}px;
    margin-bottom: 4px;
  }
  .receipt-item {
    display: flex;
    justify-content: space-between;
    gap: 4px;
    margin-bottom: 4px;
    font-size: ${typography.itemPx}px;
    font-weight: ${typography.itemWeight};
  }
  .receipt-item-left { flex: 1; word-break: break-word; }
  .receipt-item-right {
    white-space: nowrap;
    text-align: right;
    font-weight: ${typography.itemWeight};
    font-variant-numeric: tabular-nums;
  }
  .receipt-celkem {
    display: flex;
    justify-content: space-between;
    font-size: ${typography.celkemPx}px;
    font-weight: ${typography.itemWeight};
    margin: 8px 0 4px;
    padding-top: 6px;
    border-top: 2px solid #000;
  }
  .receipt-payment {
    margin: 4px 0;
    font-size: ${typography.metaPx}px;
    font-weight: ${typography.bodyWeight};
  }
  .receipt-footer {
    text-align: center;
    margin-top: 8px;
    font-size: ${typography.metaPx}px;
    font-weight: ${typography.bodyWeight};
  }
  .receipt-footer p { margin: 2px 0; }
  p { margin: 2px 0; color: #000; }
  .receipt-bitmap img.kt-bitmap {
    display: block;
    width: 100%;
    max-width: 100%;
    height: auto;
  }
  .receipt-bitmap-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 6px;
  }
  .receipt-bitmap-col { flex: 1; min-width: 0; }
  .receipt-bitmap-gap { height: 2px; }
  .receipt-inner.receipt-czech {
    width: ${width}mm;
    max-width: ${width}mm;
    margin: 0 auto;
    padding: 4px;
    font-size: var(--receipt-body-size, ${typography.bodyPx}px);
    line-height: var(--receipt-line-height, ${typography.lineHeight});
  }
  .receipt-czech .receipt-bill-id {
    text-align: right;
    font-size: var(--receipt-meta-size, ${typography.metaPx}px);
    margin: 0 0 4px;
  }
  .receipt-czech .receipt-title {
    text-align: center;
    font-size: var(--receipt-title-size, ${typography.titlePx}px);
    font-weight: ${typography.itemWeight};
    margin: 4px 0;
  }
  .receipt-czech .receipt-center { text-align: center; margin: 1px 0; font-size: var(--receipt-meta-size, ${typography.metaPx}px); }
  .receipt-czech .receipt-meta-row {
    display: flex;
    justify-content: space-between;
    gap: 3mm;
    margin-top: 4px;
    font-size: var(--receipt-meta-size, ${typography.metaPx}px);
  }
  .receipt-czech .receipt-meta-left,
  .receipt-czech .receipt-meta-right {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .receipt-czech .receipt-meta-right { text-align: right; align-items: flex-end; }
  .receipt-czech .receipt-dash {
    border: 0;
    border-bottom: 1px dashed #000;
    margin: 6px 0;
    height: 0;
  }
  .receipt-czech .receipt-items-head {
    display: flex;
    justify-content: space-between;
    font-weight: ${typography.itemWeight};
    font-size: var(--receipt-item-size, ${typography.itemPx}px);
    border-bottom: 1px dashed #000;
    padding-bottom: 3px;
    margin-bottom: 4px;
  }
  .receipt-czech .receipt-item-czech {
    display: flex;
    justify-content: space-between;
    gap: 3mm;
    margin-bottom: 2px;
    font-size: var(--receipt-item-size, ${typography.itemPx}px);
  }
  .receipt-czech .receipt-item-left { flex: 1; word-break: break-word; }
  .receipt-czech .receipt-item-right { white-space: nowrap; text-align: right; }
  .receipt-czech .receipt-total-row,
  .receipt-czech .receipt-celkem-row {
    display: flex;
    justify-content: space-between;
    gap: 3mm;
    margin-bottom: 2px;
    font-size: var(--receipt-body-size, ${typography.bodyPx}px);
  }
  .receipt-czech .receipt-celkem-row {
    font-size: var(--receipt-celkem-size, ${typography.celkemPx}px);
    font-weight: ${typography.itemWeight};
    margin: 4px 0;
  }
  .receipt-czech .receipt-payment-line { text-transform: lowercase; }
  .receipt-czech .receipt-vat-grid {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--receipt-table-size, ${typography.tablePx}px);
    margin: 4px 0;
  }
  .receipt-czech .receipt-vat-th-right,
  .receipt-czech .receipt-vat-td-right { text-align: right; }
  .receipt-czech .receipt-footer-czech {
    text-align: center;
    margin-top: 6px;
    font-size: var(--receipt-meta-size, ${typography.metaPx}px);
  }
`;
}
