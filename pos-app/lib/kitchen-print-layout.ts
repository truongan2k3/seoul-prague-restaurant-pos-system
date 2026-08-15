/** Vertical alignment for bitmap text on kitchen tickets. */
export type KitchenPrintLayoutAlign = "left" | "center";

/** Relative size multiplier applied on top of the ticket base font scale. */
export type KitchenPrintLayoutSizeScale = 0.75 | 1 | 1.25 | 1.5;

export interface KitchenPrintLayoutElement {
  show: boolean;
  align: KitchenPrintLayoutAlign;
  sizeScale: KitchenPrintLayoutSizeScale;
  /** Lower values render higher in the vertical stack. */
  order: number;
  /** Extra space above this block (px). */
  marginTop: number;
  /** Extra space below this block (px). */
  marginBottom: number;
  /** Optional absolute font size in px; overrides sizeScale when set. */
  fontSizePx: number | null;
}

export interface KitchenPrintOrderTicketLayout {
  tableLabel: KitchenPrintLayoutElement;
  printedAt: KitchenPrintLayoutElement;
  itemNamePrimary: KitchenPrintLayoutElement;
  itemNameSecondary: KitchenPrintLayoutElement;
  itemNotePrimary: KitchenPrintLayoutElement;
  itemNoteSecondary: KitchenPrintLayoutElement;
}

export interface KitchenPrintMessageTicketLayout {
  tableLabel: KitchenPrintLayoutElement;
  messageMeta: KitchenPrintLayoutElement;
  messageBody: KitchenPrintLayoutElement;
  messageSource: KitchenPrintLayoutElement;
  /** Footer is show-only in the UI; align/size/order are ignored when printing. */
  footer: KitchenPrintLayoutElement;
}

export interface KitchenPrintLayout {
  orderTicket: KitchenPrintOrderTicketLayout;
  messageTicket: KitchenPrintMessageTicketLayout;
}

const DEFAULT_ELEMENT = (
  align: KitchenPrintLayoutAlign,
  order: number,
): KitchenPrintLayoutElement => ({
  show: true,
  align,
  sizeScale: 1,
  order,
  marginTop: 0,
  marginBottom: 0,
  fontSizePx: null,
});

export const DEFAULT_KITCHEN_PRINT_LAYOUT: KitchenPrintLayout = {
  orderTicket: {
    tableLabel: DEFAULT_ELEMENT("center", 0),
    printedAt: DEFAULT_ELEMENT("center", 1),
    itemNamePrimary: DEFAULT_ELEMENT("left", 0),
    itemNameSecondary: DEFAULT_ELEMENT("left", 1),
    itemNotePrimary: DEFAULT_ELEMENT("left", 2),
    itemNoteSecondary: DEFAULT_ELEMENT("left", 3),
  },
  messageTicket: {
    tableLabel: DEFAULT_ELEMENT("center", 0),
    messageMeta: DEFAULT_ELEMENT("center", 1),
    messageBody: DEFAULT_ELEMENT("center", 0),
    messageSource: DEFAULT_ELEMENT("center", 1),
    footer: DEFAULT_ELEMENT("center", 2),
  },
};

const SIZE_SCALES: KitchenPrintLayoutSizeScale[] = [0.75, 1, 1.25, 1.5];

function parseAlign(value: unknown, fallback: KitchenPrintLayoutAlign): KitchenPrintLayoutAlign {
  return value === "left" || value === "center" ? value : fallback;
}

function parseSizeScale(
  value: unknown,
  fallback: KitchenPrintLayoutSizeScale,
): KitchenPrintLayoutSizeScale {
  const num = typeof value === "number" ? value : Number(value);
  return SIZE_SCALES.includes(num as KitchenPrintLayoutSizeScale)
    ? (num as KitchenPrintLayoutSizeScale)
    : fallback;
}

function parseOrder(value: unknown, fallback: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(20, Math.round(num)));
}

function parseFontSizePx(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.max(8, Math.min(120, Math.round(num)));
}

function parseMargin(value: unknown, fallback: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(48, Math.round(num)));
}

function parseElement(
  value: unknown,
  fallback: KitchenPrintLayoutElement,
): KitchenPrintLayoutElement {
  if (!value || typeof value !== "object") return { ...fallback };
  const row = value as Record<string, unknown>;
  return {
    show: row.show !== false,
    align: parseAlign(row.align, fallback.align),
    sizeScale: parseSizeScale(row.sizeScale, fallback.sizeScale),
    order: parseOrder(row.order, fallback.order),
    marginTop: parseMargin(row.marginTop, fallback.marginTop),
    marginBottom: parseMargin(row.marginBottom, fallback.marginBottom),
    fontSizePx: parseFontSizePx(row.fontSizePx),
  };
}

function parseOrderTicketLayout(value: unknown): KitchenPrintOrderTicketLayout {
  const defaults = DEFAULT_KITCHEN_PRINT_LAYOUT.orderTicket;
  if (!value || typeof value !== "object") return { ...defaults };
  const row = value as Record<string, unknown>;
  return {
    tableLabel: parseElement(row.tableLabel, defaults.tableLabel),
    printedAt: parseElement(row.printedAt, defaults.printedAt),
    itemNamePrimary: parseElement(row.itemNamePrimary, defaults.itemNamePrimary),
    itemNameSecondary: parseElement(row.itemNameSecondary, defaults.itemNameSecondary),
    itemNotePrimary: parseElement(row.itemNotePrimary, defaults.itemNotePrimary),
    itemNoteSecondary: parseElement(row.itemNoteSecondary, defaults.itemNoteSecondary),
  };
}

function parseMessageTicketLayout(value: unknown): KitchenPrintMessageTicketLayout {
  const defaults = DEFAULT_KITCHEN_PRINT_LAYOUT.messageTicket;
  if (!value || typeof value !== "object") return { ...defaults };
  const row = value as Record<string, unknown>;
  return {
    tableLabel: parseElement(row.tableLabel, defaults.tableLabel),
    messageMeta: parseElement(row.messageMeta, defaults.messageMeta),
    messageBody: parseElement(row.messageBody, defaults.messageBody),
    messageSource: parseElement(row.messageSource, defaults.messageSource),
    // Accept legacy `messageFooter` key from earlier drafts.
    footer: parseElement(row.footer ?? row.messageFooter, defaults.footer),
  };
}

export function parseKitchenPrintLayout(value: unknown): KitchenPrintLayout {
  if (!value || typeof value !== "object") return DEFAULT_KITCHEN_PRINT_LAYOUT;
  const row = value as Record<string, unknown>;
  return {
    orderTicket: parseOrderTicketLayout(row.orderTicket),
    messageTicket: parseMessageTicketLayout(row.messageTicket),
  };
}

export function layoutPx(basePx: number, element: KitchenPrintLayoutElement): number {
  if (element.fontSizePx != null && element.fontSizePx > 0) {
    return element.fontSizePx;
  }
  return Math.max(8, Math.round(basePx * element.sizeScale));
}

export function layoutBlockStyle(element: KitchenPrintLayoutElement): string {
  const parts: string[] = [];
  if (element.marginTop > 0) parts.push(`margin-top:${element.marginTop}px`);
  if (element.marginBottom > 0) parts.push(`margin-bottom:${element.marginBottom}px`);
  return parts.join(";");
}

export function sortLayoutBlocks<T extends { order: number }>(blocks: T[]): T[] {
  return [...blocks].sort((a, b) => a.order - b.order);
}
