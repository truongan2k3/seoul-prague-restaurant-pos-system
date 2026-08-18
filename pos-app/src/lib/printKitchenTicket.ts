import { aggregateDisplayItems } from "@/lib/order-item-aggregate";
import { resolveKitchenTicketItemDisplay } from "@/lib/kitchen-ticket-display";
import {
  DEFAULT_KITCHEN_CLIP_TOP_MM,
  DEFAULT_KITCHEN_PRINT_LAYOUT,
  kitchenClipTopDots,
  kitchenClipTopPx,
  kitchenHeaderItemGapPx,
  clampKitchenItemGapPx,
  DEFAULT_KITCHEN_ITEM_GAP_PX,
  layoutBlockStyle,
  layoutPx,
  sortLayoutBlocks,
  type KitchenPrintLayout,
  type KitchenPrintLayoutElement,
} from "@/lib/kitchen-print-layout";
import { kitchenBitmapWeights, type KitchenBitmapWeight } from "@/lib/receipt-print-styles";
import { shouldPrintKitchenOnSend } from "@/lib/kitchen-fulfillment-mode";
import type {
  AppSettings,
  KitchenPrintFontSize,
  KitchenPrintLanguage,
  MenuItem,
  OrderItem,
  ReceiptFontWeight,
} from "@/lib/types";
import { printReceiptHTML } from "@/src/lib/printReceipt";
import {
  bitmapImgHtml,
  blankPngDataUrl,
  ensureCjkPrintFont,
  textToPngDataUrl,
} from "@/src/lib/printTextBitmap";

/** 80mm roll; keep ~2mm side margins → ~76mm content ≈ 560 CSS px @ 96dpi-ish. */
const TICKET_WIDTH_MM = 80;
const CONTENT_WIDTH_PX = 560;
const NAME_WIDTH_PX = 470;
const FULL_WIDTH_PX = 540;

interface KitchenTypeScale {
  table: number;
  meta: number;
  qty: number;
  namePrimary: number;
  nameSecondary: number;
  notePrimary: number;
  noteSecondary: number;
  message: number;
  messageSrc: number;
  empty: number;
}

/** Large is the smallest option; sizes tuned for 80mm kitchen readability. */
const ORDER_TYPE_SCALE: Record<KitchenPrintFontSize, KitchenTypeScale> = {
  large: {
    table: 40,
    meta: 16,
    qty: 34,
    namePrimary: 34,
    nameSecondary: 20,
    notePrimary: 20,
    noteSecondary: 16,
    message: 34,
    messageSrc: 16,
    empty: 28,
  },
  xlarge: {
    table: 46,
    meta: 18,
    qty: 40,
    namePrimary: 42,
    nameSecondary: 24,
    notePrimary: 24,
    noteSecondary: 18,
    message: 42,
    messageSrc: 18,
    empty: 34,
  },
  xxlarge: {
    table: 52,
    meta: 20,
    qty: 46,
    namePrimary: 50,
    nameSecondary: 28,
    notePrimary: 28,
    noteSecondary: 22,
    message: 50,
    messageSrc: 22,
    empty: 40,
  },
};

function scaleFor(size: KitchenPrintFontSize | undefined): KitchenTypeScale {
  return ORDER_TYPE_SCALE[size ?? "xlarge"] ?? ORDER_TYPE_SCALE.xlarge;
}

function bmp(
  text: string,
  opts: {
    width: number;
    size: number;
    weight?: KitchenBitmapWeight;
    align?: "left" | "center";
  },
  sink?: string[],
): string {
  const url = textToPngDataUrl(text, {
    maxWidthPx: opts.width,
    fontSizePx: opts.size,
    fontWeight: opts.weight ?? 700,
    align: opts.align ?? "left",
    dpr: 2,
  });
  if (url && sink) sink.push(url);
  return bitmapImgHtml(url, text, opts.width);
}

export type KitchenPrintSettings = Pick<
  AppSettings,
  | "kitchenPrintEnabled"
  | "kitchenFulfillmentMode"
  | "kitchenPrintPrimaryLang"
  | "kitchenPrintSecondaryLang"
  | "kitchenPrintOrderFontSize"
  | "kitchenPrintMessageFontSize"
  | "kitchenPrintOrderFontWeight"
  | "kitchenPrintMessageFontWeight"
  | "kitchenPrintLayout"
  | "kitchenPrintClipTopMm"
  | "kitchenPrintItemGapPx"
  | "receiptFontSize"
  | "receiptFontWeight"
  | "receiptFontFamily"
  | "silentPrintEnabled"
  | "printBridgeUrl"
  | "browserPrintFallback"
  | "printers"
>;

function kitchenClipSpacerHtml(widthPx: number, clipTopMm: number): string {
  const heightPx = kitchenClipTopPx(clipTopMm);
  if (heightPx <= 0) return "";
  const png = blankPngDataUrl(widthPx, heightPx, 2);
  return bitmapImgHtml(png, "", widthPx);
}

/** Vertical gap between kitchen ticket bitmap strips (ESC/POS ignores HTML padding). */
function pushKitchenBitmapSpacer(pngs: string[], heightPx: number) {
  if (heightPx <= 0) return;
  const png = blankPngDataUrl(FULL_WIDTH_PX, heightPx, 2);
  if (png) pngs.push(png);
}

function kitchenTicketCss(qtyPx: number, itemGapPx: number): string {
  const gap = clampKitchenItemGapPx(itemGapPx);
  return `
    <style>
      .kitchen-ticket {
        width: ${TICKET_WIDTH_MM - 4}mm;
        max-width: ${CONTENT_WIDTH_PX}px;
        margin: 0 auto;
        background: #fff !important;
        color: #000 !important;
        font-family: Arial, Helvetica, sans-serif;
      }
      .kitchen-clip-spacer {
        display: block;
        overflow: hidden;
        line-height: 0;
      }
      .kitchen-ticket img.kt-bitmap {
        display: block;
        max-width: 100%;
        height: auto;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .kitchen-header {
        text-align: center;
        border-bottom: 2px solid #000;
        padding-bottom: 6px;
        margin-bottom: 8px;
      }
      .kitchen-header .kt-bitmap { margin: 0 auto; }
      .kitchen-meta-gap { height: 4px; }
      .kitchen-item {
        padding: 4px 0 ${gap}px;
      }
      .kitchen-item:last-child {
        padding-bottom: 4px;
      }
      .kitchen-item-row {
        display: flex;
        gap: 6px;
        align-items: flex-start;
      }
      .kitchen-qty {
        flex: 0 0 auto;
        font-size: ${qtyPx}px;
        font-weight: 700;
        line-height: 1.2;
        min-width: 1.8em;
      }
      .kitchen-name-col { flex: 1; min-width: 0; }
      .kitchen-name-secondary { margin-top: 3px; }
      .kitchen-note { margin-top: 5px; padding-left: 2px; }
      .kitchen-note-secondary { margin-top: 2px; }
      .kitchen-message-box {
        border: 2px solid #000;
        padding: 10px 6px;
        margin-top: 8px;
      }
      .kitchen-footer {
        margin-top: 10px;
        text-align: center;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.04em;
      }
    </style>`;
}

function drawLayoutLine(
  draw: (
    text: string,
    opts: {
      width: number;
      size: number;
      weight?: KitchenBitmapWeight;
      align?: "left" | "center";
    },
  ) => string,
  text: string,
  element: KitchenPrintLayoutElement,
  opts: {
    width: number;
    baseSize: number;
    weight: KitchenBitmapWeight;
    className?: string;
  },
): string {
  if (!element.show || !text) return "";
  const img = draw(text, {
    width: opts.width,
    size: layoutPx(opts.baseSize, element),
    weight: opts.weight,
    align: element.align,
  });
  const style = layoutBlockStyle(element);
  const styleAttr = style ? ` style="${style}"` : "";
  if (!opts.className) return `<div${styleAttr}>${img}</div>`;
  return `<div class="${opts.className}"${styleAttr}>${img}</div>`;
}

export async function buildKitchenTicketHtml(input: {
  tableLabel: string;
  orders: OrderItem[];
  menuItems: MenuItem[];
  primaryLang: KitchenPrintLanguage;
  secondaryLang: KitchenPrintLanguage | "none";
  fontSize?: KitchenPrintFontSize;
  fontWeight?: ReceiptFontWeight;
  layout?: KitchenPrintLayout;
  stationLabel?: string;
  clipTopMm?: number;
  itemGapPx?: number;
}): Promise<{ html: string; pngs: string[] }> {
  await ensureCjkPrintFont();
  const s = scaleFor(input.fontSize);
  const weights = kitchenBitmapWeights(input.fontWeight ?? "bold");
  const layout = input.layout ?? DEFAULT_KITCHEN_PRINT_LAYOUT;
  const clipTopMm = input.clipTopMm ?? DEFAULT_KITCHEN_CLIP_TOP_MM;
  const itemGapPx = clampKitchenItemGapPx(input.itemGapPx ?? DEFAULT_KITCHEN_ITEM_GAP_PX);
  const headerItemGapPx = kitchenHeaderItemGapPx(itemGapPx);
  const orderLayout = layout.orderTicket;
  const pngs: string[] = [];
  const draw = (
    text: string,
    opts: {
      width: number;
      size: number;
      weight?: KitchenBitmapWeight;
      align?: "left" | "center";
    },
  ) => bmp(text, opts, pngs);

  const lines = aggregateDisplayItems(input.orders);
  const now = new Date();
  const printedAt = now.toLocaleString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const headerBlocks = sortLayoutBlocks([
    {
      order: orderLayout.tableLabel.order,
      html: drawLayoutLine(draw, `Table: ${input.tableLabel}`, orderLayout.tableLabel, {
        width: FULL_WIDTH_PX,
        baseSize: s.table,
        weight: weights.primary,
      }),
    },
    {
      order: orderLayout.printedAt.order,
      html: drawLayoutLine(draw, printedAt, orderLayout.printedAt, {
        width: FULL_WIDTH_PX,
        baseSize: s.meta,
        weight: weights.secondary,
      }),
    },
  ])
    .map((block) => block.html)
    .filter(Boolean)
    .join('<div class="kitchen-meta-gap"></div>');

  // Kitchen: ZH (large) + EN (small). Bar tickets: English only.
  const englishOnly = input.stationLabel === "BAR";
  const itemBlocks = lines
    .map((item, itemIndex) => {
      if (itemIndex === 0 && headerBlocks) {
        pushKitchenBitmapSpacer(pngs, headerItemGapPx);
      }

      const display = resolveKitchenTicketItemDisplay(item, input.menuItems, { englishOnly });
      if (!display) return "";

      const primaryLine =
        display.kind === "sauce-prep"
          ? display.primary
          : `${display.quantity}× ${display.primary}`;
      const secondary = display.secondary;
      const noteZh = display.noteZh;
      const noteEn = display.noteEn;

      const itemLines = sortLayoutBlocks([
        {
          order: orderLayout.itemNamePrimary.order,
          html: primaryLine
            ? drawLayoutLine(draw, primaryLine, orderLayout.itemNamePrimary, {
                width: FULL_WIDTH_PX,
                baseSize: s.namePrimary,
                weight: weights.primary,
              })
            : "",
        },
        {
          order: orderLayout.itemNameSecondary.order,
          html: secondary
            ? drawLayoutLine(draw, secondary, orderLayout.itemNameSecondary, {
                width: FULL_WIDTH_PX,
                baseSize: s.nameSecondary,
                weight: weights.secondary,
                className: "kitchen-name-secondary",
              })
            : "",
        },
        {
          order: orderLayout.itemNotePrimary.order,
          html: noteZh
            ? drawLayoutLine(draw, noteZh, orderLayout.itemNotePrimary, {
                width: FULL_WIDTH_PX,
                baseSize: s.namePrimary,
                weight: weights.primary,
                className: "kitchen-note kitchen-note-primary",
              })
            : "",
        },
        {
          order: orderLayout.itemNoteSecondary.order,
          html: noteEn
            ? drawLayoutLine(draw, noteEn, orderLayout.itemNoteSecondary, {
                width: FULL_WIDTH_PX,
                baseSize: s.noteSecondary,
                weight: weights.secondary,
                className: "kitchen-note kitchen-note-secondary",
              })
            : "",
        },
      ])
        .map((block) => block.html)
        .filter(Boolean)
        .join("");

      if (!itemLines) return "";

      if (itemIndex < lines.length - 1) {
        pushKitchenBitmapSpacer(pngs, itemGapPx);
      }

      return `
        <div class="kitchen-item">
          <div class="kitchen-name-col">
            ${itemLines}
          </div>
        </div>`;
    })
    .filter(Boolean)
    .join("");

  const clipHtml = kitchenClipSpacerHtml(FULL_WIDTH_PX, clipTopMm);

  const html = `
    ${kitchenTicketCss(s.qty, itemGapPx)}
    <div class="kitchen-ticket">
      ${clipHtml ? `<div class="kitchen-clip-spacer">${clipHtml}</div>` : ""}
      ${headerBlocks ? `<div class="kitchen-header">${headerBlocks}</div>` : ""}
      ${
        itemBlocks ||
        `<div class="kitchen-item">${draw("—", { width: FULL_WIDTH_PX, size: s.empty, weight: weights.primary })}</div>`
      }
    </div>`;

  return { html, pngs };
}

export async function buildKitchenMessageHtml(input: {
  tableLabel?: string;
  message: string;
  messageZh: string;
  fontSize?: KitchenPrintFontSize;
  fontWeight?: ReceiptFontWeight;
  layout?: KitchenPrintLayout;
  clipTopMm?: number;
}): Promise<{ html: string; pngs: string[] }> {
  await ensureCjkPrintFont();
  const s = scaleFor(input.fontSize);
  const weights = kitchenBitmapWeights(input.fontWeight ?? "bold");
  const layout = (input.layout ?? DEFAULT_KITCHEN_PRINT_LAYOUT).messageTicket;
  const clipTopMm = input.clipTopMm ?? DEFAULT_KITCHEN_CLIP_TOP_MM;
  const pngs: string[] = [];
  const draw = (
    text: string,
    opts: {
      width: number;
      size: number;
      weight?: KitchenBitmapWeight;
      align?: "left" | "center";
    },
  ) => bmp(text, opts, pngs);

  const now = new Date();
  const time = now.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  const zh = input.messageZh.trim() || input.message.trim();
  const src = input.message.trim();

  const tableLabel = input.tableLabel?.trim();

  const headerBlocks = sortLayoutBlocks([
    ...(tableLabel
      ? [
          {
            order: layout.tableLabel.order,
            html: drawLayoutLine(draw, `TABLE ${tableLabel}`, layout.tableLabel, {
              width: FULL_WIDTH_PX,
              baseSize: s.table,
              weight: weights.primary,
            }),
          },
        ]
      : []),
    {
      order: layout.messageMeta.order,
      html: drawLayoutLine(draw, `MESSAGE · ${time}`, layout.messageMeta, {
        width: FULL_WIDTH_PX,
        baseSize: s.meta,
        weight: weights.secondary,
      }),
    },
  ])
    .map((block) => block.html)
    .filter(Boolean)
    .join('<div class="kitchen-meta-gap"></div>');

  const bodyBlocks = sortLayoutBlocks([
    {
      order: layout.messageBody.order,
      html: drawLayoutLine(draw, zh, layout.messageBody, {
        width: FULL_WIDTH_PX - 20,
        baseSize: s.message,
        weight: weights.primary,
      }),
    },
    {
      order: layout.messageSource.order,
      html:
        src && src !== zh
          ? drawLayoutLine(draw, src, layout.messageSource, {
              width: FULL_WIDTH_PX - 20,
              baseSize: s.messageSrc,
              weight: weights.secondary,
            })
          : "",
    },
  ])
    .map((block) => block.html)
    .filter(Boolean)
    .join('<div class="kitchen-meta-gap"></div>');

  const footerHtml = layout.footer.show
    ? `<div class="kitchen-footer">*** STAFF MESSAGE ***</div>`
    : "";

  const clipHtml = kitchenClipSpacerHtml(FULL_WIDTH_PX, clipTopMm);

  const html = `
    ${kitchenTicketCss(s.qty, 0)}
    <div class="kitchen-ticket">
      ${clipHtml ? `<div class="kitchen-clip-spacer">${clipHtml}</div>` : ""}
      ${headerBlocks ? `<div class="kitchen-header">${headerBlocks}</div>` : ""}
      ${bodyBlocks ? `<div class="kitchen-message-box">${bodyBlocks}</div>` : ""}
      ${footerHtml}
    </div>`;

  return { html, pngs };
}

async function dispatchKitchenPrint(
  settings: KitchenPrintSettings,
  html: string,
  pngs: string[],
  role: "kitchen" | "kitchen-message" | "bar" = "kitchen",
): Promise<void> {
  const fontSettings = {
    receiptFontSize: settings.receiptFontSize,
    receiptFontWeight: settings.receiptFontWeight,
    receiptFontFamily: settings.receiptFontFamily,
    paperWidthMm: TICKET_WIDTH_MM,
  };

  if (settings.silentPrintEnabled && pngs.length > 0) {
    try {
      const { buildEscPosFromPngs } = await import("@/src/lib/escpos");
      const { silentPrintEscPos } = await import("@/src/lib/print-bridge-client");
      const clipDots = kitchenClipTopDots(settings.kitchenPrintClipTopMm);
      const bytes = await buildEscPosFromPngs(pngs, {
        topBlankRasterDots: clipDots > 0 ? clipDots : undefined,
        bottomBlankRasterDots: 32,
        bottomFeedLines: 6,
      });
      let result = await silentPrintEscPos(settings, role, bytes);
      // Messages: if no printer has kitchen-message role, fall back to kitchen printers.
      if (
        !result.sent &&
        role === "kitchen-message" &&
        result.error === "No enabled printers for this role"
      ) {
        result = await silentPrintEscPos(settings, "kitchen", bytes);
      }
      if (result.sent) return;
      // No bar printer configured → skip (do not print bar tickets on kitchen).
      if (role === "bar" && result.error === "No enabled printers for this role") {
        console.warn("[KitchenPrint] Skipping bar ticket — no bar printer configured");
        return;
      }
      console.warn("[KitchenPrint] Silent print incomplete:", result.error);
      if (!settings.browserPrintFallback) {
        throw new Error(result.error || "Silent kitchen print failed");
      }
    } catch (error) {
      console.warn("[KitchenPrint] Silent print failed:", error);
      if (!settings.browserPrintFallback) throw error;
    }
  }

  await printReceiptHTML(html, fontSettings);
}

async function printStationTicket(input: {
  tableLabel: string;
  orders: OrderItem[];
  menuItems: MenuItem[];
  settings: KitchenPrintSettings;
  role: "kitchen" | "bar";
  stationLabel?: string;
}): Promise<void> {
  if (input.orders.length === 0) return;

  const { html, pngs } = await buildKitchenTicketHtml({
    tableLabel: input.tableLabel,
    orders: input.orders,
    menuItems: input.menuItems,
    primaryLang: input.settings.kitchenPrintPrimaryLang,
    secondaryLang: input.settings.kitchenPrintSecondaryLang,
    fontSize: input.settings.kitchenPrintOrderFontSize,
    fontWeight: input.settings.kitchenPrintOrderFontWeight,
    layout: input.settings.kitchenPrintLayout,
    stationLabel: input.stationLabel,
    clipTopMm: input.settings.kitchenPrintClipTopMm,
    itemGapPx: input.settings.kitchenPrintItemGapPx,
  });

  await dispatchKitchenPrint(input.settings, html, pngs, input.role);
}

export async function printKitchenTicket(input: {
  tableLabel: string;
  orders: OrderItem[];
  menuItems: MenuItem[];
  settings: KitchenPrintSettings;
  stationLabel?: string;
}): Promise<void> {
  if (!shouldPrintKitchenOnSend(input.settings) || input.orders.length === 0) return;

  const kitchenOrders = input.orders.filter(
    (order) => order.station !== "bar" && !order.skipPrint,
  );
  const barOrders = input.orders.filter(
    (order) => order.station === "bar" && !order.skipPrint,
  );
  if (kitchenOrders.length === 0 && barOrders.length === 0) return;

  await printStationTicket({
    ...input,
    orders: kitchenOrders,
    role: "kitchen",
    stationLabel: input.stationLabel ?? "KITCHEN",
  });
  await printStationTicket({
    ...input,
    orders: barOrders,
    role: "bar",
    stationLabel: "BAR",
  });
}

export async function printKitchenMessage(input: {
  tableLabel?: string;
  message: string;
  messageZh: string;
  settings: KitchenPrintSettings;
}): Promise<void> {
  if (!shouldPrintKitchenOnSend(input.settings)) return;
  const { html, pngs } = await buildKitchenMessageHtml({
    tableLabel: input.tableLabel,
    message: input.message,
    messageZh: input.messageZh,
    fontSize: input.settings.kitchenPrintMessageFontSize,
    fontWeight: input.settings.kitchenPrintMessageFontWeight,
    layout: input.settings.kitchenPrintLayout,
    clipTopMm: input.settings.kitchenPrintClipTopMm,
  });
  await dispatchKitchenPrint(input.settings, html, pngs, "kitchen-message");
}
