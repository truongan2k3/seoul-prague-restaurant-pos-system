import type { AppSettings, ReceiptFontFamily, ReceiptFontSize, ReceiptFontWeight } from "@/lib/types";

export interface ReceiptFontOption {
  id: ReceiptFontFamily;
  stack: string;
  sample: string;
}

/** CJK fallbacks — monospace Latin fonts often omit Chinese glyphs (prints as blank). */
const CJK_FONT_FALLBACK =
  "'PingFang SC', 'Hiragino Sans GB', 'Heiti SC', 'Microsoft YaHei', 'Noto Sans SC', 'Source Han Sans SC', 'WenQuanYi Micro Hei', sans-serif";

/** System font stacks — no web fonts, reliable on thermal printers & Windows POS. */
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
    stack: `Arial, Helvetica, 'Segoe UI', ${CJK_FONT_FALLBACK}`,
    sample: "Arial",
  },
  {
    id: "tahoma",
    stack: `Tahoma, Verdana, 'Segoe UI', ${CJK_FONT_FALLBACK}`,
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
    bodyPx: 11,
    itemPx: 11,
    metaPx: 10,
    tablePx: 10,
    titlePx: 13,
    indexPx: 16,
    celkemPx: 12,
    lineHeight: 1.25,
  },
  medium: {
    bodyPx: 13,
    itemPx: 13,
    metaPx: 11,
    tablePx: 11,
    titlePx: 14,
    indexPx: 18,
    celkemPx: 13,
    lineHeight: 1.35,
  },
  large: {
    bodyPx: 15,
    itemPx: 15,
    metaPx: 12,
    tablePx: 12,
    titlePx: 16,
    indexPx: 20,
    celkemPx: 15,
    lineHeight: 1.35,
  },
};

const WEIGHT_SCALE: Record<ReceiptFontWeight, Pick<ReceiptTypography, "bodyWeight" | "itemWeight">> = {
  normal: { bodyWeight: 400, itemWeight: 600 },
  semibold: { bodyWeight: 600, itemWeight: 700 },
  bold: { bodyWeight: 700, itemWeight: 700 },
  extrabold: { bodyWeight: 800, itemWeight: 800 },
};

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
  return "consolas";
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

export function buildThermalPrintCss(typography: ReceiptTypography): string {
  return `
  @page {
    size: 72mm auto;
    margin: 0mm;
  }
  * {
    box-sizing: border-box;
  }
  html, body {
    width: 72mm;
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
  }
  body {
    padding: 2mm;
    font-family: ${typography.fontFamily};
    font-size: ${typography.bodyPx}px;
    font-weight: ${typography.bodyWeight};
    line-height: ${typography.lineHeight};
    -webkit-font-smoothing: none;
    -moz-osx-font-smoothing: unset;
    text-rendering: optimizeLegibility;
    color: #000;
    background: #fff;
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
`;
}
