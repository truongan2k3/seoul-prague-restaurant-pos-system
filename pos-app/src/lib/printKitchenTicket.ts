import { isGrillGuestPrepOrder } from "@/lib/grill-guest-count";
import { aggregateDisplayItems } from "@/lib/order-item-aggregate";
import { menuItemDisplayName, resolveMenuItemForOrder } from "@/lib/menu-display";
import type {
  AppSettings,
  KitchenPrintFontSize,
  KitchenPrintLanguage,
  MenuItem,
  OrderItem,
} from "@/lib/types";
import { printReceiptHTML } from "@/src/lib/printReceipt";
import {
  bitmapImgHtml,
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

const ORDER_TYPE_SCALE: Record<KitchenPrintFontSize, KitchenTypeScale> = {
  normal: {
    table: 28,
    meta: 12,
    qty: 22,
    namePrimary: 22,
    nameSecondary: 13,
    notePrimary: 14,
    noteSecondary: 12,
    message: 22,
    messageSrc: 12,
    empty: 20,
  },
  large: {
    table: 34,
    meta: 14,
    qty: 28,
    namePrimary: 28,
    nameSecondary: 16,
    notePrimary: 17,
    noteSecondary: 14,
    message: 28,
    messageSrc: 14,
    empty: 24,
  },
  xlarge: {
    table: 40,
    meta: 16,
    qty: 34,
    namePrimary: 34,
    nameSecondary: 19,
    notePrimary: 20,
    noteSecondary: 16,
    message: 34,
    messageSrc: 16,
    empty: 28,
  },
};

function scaleFor(size: KitchenPrintFontSize | undefined): KitchenTypeScale {
  return ORDER_TYPE_SCALE[size ?? "large"] ?? ORDER_TYPE_SCALE.large;
}

function langLabel(lang: KitchenPrintLanguage): string {
  if (lang === "zh") return "ZH";
  if (lang === "cs") return "CS";
  return "EN";
}

function itemNameForLang(
  item: OrderItem,
  menuItems: MenuItem[],
  lang: KitchenPrintLanguage,
): string {
  if (isGrillGuestPrepOrder(item)) {
    if (lang === "zh") return "准备烤肉蘸料";
    if (lang === "cs") return "Příprava omáčky ke grilu";
    return "BBQ dipping sauce prep";
  }
  const menu = resolveMenuItemForOrder(item, menuItems);
  if (menu) return menuItemDisplayName(menu, lang);
  return item.name;
}

/** Prefer real Chinese name; never silently drop ZH when it exists on the menu. */
function dualItemNames(
  item: OrderItem,
  menuItems: MenuItem[],
  primaryLang: KitchenPrintLanguage,
  secondaryLang: KitchenPrintLanguage | "none",
): { primary: string; secondary: string } {
  const primary = itemNameForLang(item, menuItems, primaryLang);
  if (secondaryLang === "none") return { primary, secondary: "" };

  let secondary = itemNameForLang(item, menuItems, secondaryLang);

  if (primaryLang === "zh" || secondaryLang === "zh") {
    const menu = resolveMenuItemForOrder(item, menuItems);
    const zh = menu?.nameZh?.trim() || (isGrillGuestPrepOrder(item) ? "准备烤肉蘸料" : "");
    const en = menu?.nameEn?.trim() || item.name;
    if (primaryLang === "zh" && zh) {
      return {
        primary: zh,
        secondary: secondaryLang === "en" ? en : secondary,
      };
    }
    if (secondaryLang === "zh" && zh && zh !== primary) {
      secondary = zh;
    }
  }

  if (secondary.trim().toLowerCase() === primary.trim().toLowerCase()) {
    return { primary, secondary: "" };
  }
  return { primary, secondary };
}

function noteForLang(item: OrderItem, lang: KitchenPrintLanguage): string {
  const original = item.notes?.trim() ?? "";
  const translated = item.notesTranslated?.trim() ?? "";
  if (lang === "zh") return translated || original;
  return original || translated;
}

function bmp(
  text: string,
  opts: {
    width: number;
    size: number;
    weight?: 400 | 600 | 700;
    align?: "left" | "center";
  },
): string {
  const url = textToPngDataUrl(text, {
    maxWidthPx: opts.width,
    fontSizePx: opts.size,
    fontWeight: opts.weight ?? 700,
    align: opts.align ?? "left",
    dpr: 2,
  });
  return bitmapImgHtml(url, text, opts.width);
}

export type KitchenPrintSettings = Pick<
  AppSettings,
  | "kitchenPrintEnabled"
  | "kitchenPrintPrimaryLang"
  | "kitchenPrintSecondaryLang"
  | "kitchenPrintOrderFontSize"
  | "kitchenPrintMessageFontSize"
  | "receiptFontSize"
  | "receiptFontWeight"
  | "receiptFontFamily"
>;

function kitchenTicketCss(qtyPx: number): string {
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
        border-bottom: 1px dashed #000;
        padding: 8px 0;
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

export async function buildKitchenTicketHtml(input: {
  tableLabel: string;
  orders: OrderItem[];
  menuItems: MenuItem[];
  primaryLang: KitchenPrintLanguage;
  secondaryLang: KitchenPrintLanguage | "none";
  fontSize?: KitchenPrintFontSize;
  stationLabel?: string;
}): Promise<string> {
  await ensureCjkPrintFont();
  const s = scaleFor(input.fontSize);

  const lines = aggregateDisplayItems(input.orders);
  const now = new Date();
  const time = now.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  const station = input.stationLabel ?? "KITCHEN";
  const langs =
    input.secondaryLang === "none"
      ? langLabel(input.primaryLang)
      : `${langLabel(input.primaryLang)} / ${langLabel(input.secondaryLang)}`;

  const itemBlocks = lines
    .map((item) => {
      const { primary, secondary } = dualItemNames(
        item,
        input.menuItems,
        input.primaryLang,
        input.secondaryLang,
      );
      const notePrimary = noteForLang(item, input.primaryLang);
      const noteSecondary =
        input.secondaryLang === "none" ? "" : noteForLang(item, input.secondaryLang);
      const showNoteSecondary =
        Boolean(noteSecondary) &&
        noteSecondary.trim().toLowerCase() !== notePrimary.trim().toLowerCase();

      const namePrimaryHtml = bmp(primary, {
        width: NAME_WIDTH_PX,
        size: s.namePrimary,
        weight: 700,
      });
      const nameSecondaryHtml = secondary
        ? `<div class="kitchen-name-secondary">${bmp(secondary, {
            width: NAME_WIDTH_PX,
            size: s.nameSecondary,
            weight: 600,
          })}</div>`
        : "";

      const noteHtml =
        notePrimary || showNoteSecondary
          ? `<div class="kitchen-note">
              ${
                notePrimary
                  ? `<div class="kitchen-note-primary">${bmp(`※ ${notePrimary}`, {
                      width: FULL_WIDTH_PX,
                      size: s.notePrimary,
                      weight: 700,
                    })}</div>`
                  : ""
              }
              ${
                showNoteSecondary
                  ? `<div class="kitchen-note-secondary">${bmp(noteSecondary, {
                      width: FULL_WIDTH_PX,
                      size: s.noteSecondary,
                      weight: 600,
                    })}</div>`
                  : ""
              }
            </div>`
          : "";

      return `
        <div class="kitchen-item">
          <div class="kitchen-item-row">
            <span class="kitchen-qty">${item.quantity}×</span>
            <div class="kitchen-name-col">
              ${namePrimaryHtml}
              ${nameSecondaryHtml}
            </div>
          </div>
          ${noteHtml}
        </div>`;
    })
    .join("");

  return `
    ${kitchenTicketCss(s.qty)}
    <div class="kitchen-ticket">
      <div class="kitchen-header">
        ${bmp(`TABLE ${input.tableLabel}`, {
          width: FULL_WIDTH_PX,
          size: s.table,
          weight: 700,
          align: "center",
        })}
        <div class="kitchen-meta-gap"></div>
        ${bmp(`${station} · ${time}`, {
          width: FULL_WIDTH_PX,
          size: s.meta,
          weight: 600,
          align: "center",
        })}
        <div class="kitchen-meta-gap"></div>
        ${bmp(langs, {
          width: FULL_WIDTH_PX,
          size: Math.max(11, s.meta - 1),
          weight: 600,
          align: "center",
        })}
      </div>
      ${
        itemBlocks ||
        `<div class="kitchen-item">${bmp("—", { width: FULL_WIDTH_PX, size: s.empty })}</div>`
      }
      <div class="kitchen-footer">*** NEW ORDER ***</div>
    </div>`;
}

export async function buildKitchenMessageHtml(input: {
  tableLabel: string;
  message: string;
  messageZh: string;
  fontSize?: KitchenPrintFontSize;
}): Promise<string> {
  await ensureCjkPrintFont();
  const s = scaleFor(input.fontSize);

  const now = new Date();
  const time = now.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  const zh = input.messageZh.trim() || input.message.trim();
  const src = input.message.trim();

  return `
    ${kitchenTicketCss(s.qty)}
    <div class="kitchen-ticket">
      <div class="kitchen-header">
        ${bmp(`TABLE ${input.tableLabel}`, {
          width: FULL_WIDTH_PX,
          size: s.table,
          weight: 700,
          align: "center",
        })}
        <div class="kitchen-meta-gap"></div>
        ${bmp(`MESSAGE · ${time}`, {
          width: FULL_WIDTH_PX,
          size: s.meta,
          weight: 600,
          align: "center",
        })}
      </div>
      <div class="kitchen-message-box">
        ${bmp(zh, {
          width: FULL_WIDTH_PX - 20,
          size: s.message,
          weight: 700,
          align: "center",
        })}
        ${
          src && src !== zh
            ? `<div class="kitchen-meta-gap"></div>${bmp(src, {
                width: FULL_WIDTH_PX - 20,
                size: s.messageSrc,
                weight: 600,
                align: "center",
              })}`
            : ""
        }
      </div>
      <div class="kitchen-footer">*** STAFF MESSAGE ***</div>
    </div>`;
}

export async function printKitchenTicket(input: {
  tableLabel: string;
  orders: OrderItem[];
  menuItems: MenuItem[];
  settings: KitchenPrintSettings;
  stationLabel?: string;
}): Promise<void> {
  if (!input.settings.kitchenPrintEnabled || input.orders.length === 0) return;

  const html = await buildKitchenTicketHtml({
    tableLabel: input.tableLabel,
    orders: input.orders,
    menuItems: input.menuItems,
    primaryLang: input.settings.kitchenPrintPrimaryLang,
    secondaryLang: input.settings.kitchenPrintSecondaryLang,
    fontSize: input.settings.kitchenPrintOrderFontSize,
    stationLabel: input.stationLabel,
  });

  await printReceiptHTML(html, {
    receiptFontSize: input.settings.receiptFontSize,
    receiptFontWeight: input.settings.receiptFontWeight,
    receiptFontFamily: input.settings.receiptFontFamily,
    paperWidthMm: TICKET_WIDTH_MM,
  });
}

export async function printKitchenMessage(input: {
  tableLabel: string;
  message: string;
  messageZh: string;
  settings: KitchenPrintSettings;
}): Promise<void> {
  if (!input.settings.kitchenPrintEnabled) return;
  const html = await buildKitchenMessageHtml({
    tableLabel: input.tableLabel,
    message: input.message,
    messageZh: input.messageZh,
    fontSize: input.settings.kitchenPrintMessageFontSize,
  });
  await printReceiptHTML(html, {
    receiptFontSize: input.settings.receiptFontSize,
    receiptFontWeight: input.settings.receiptFontWeight,
    receiptFontFamily: input.settings.receiptFontFamily,
    paperWidthMm: TICKET_WIDTH_MM,
  });
}
