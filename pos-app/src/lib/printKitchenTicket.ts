import { aggregateDisplayItems } from "@/lib/order-item-aggregate";
import { menuItemDisplayName, resolveMenuItemForOrder } from "@/lib/menu-display";
import type {
  AppSettings,
  KitchenPrintLanguage,
  MenuItem,
  OrderItem,
} from "@/lib/types";
import { printReceiptHTML } from "@/src/lib/printReceipt";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function langLabel(lang: KitchenPrintLanguage): string {
  if (lang === "zh") return "中文";
  if (lang === "cs") return "CS";
  return "EN";
}

function itemNameForLang(
  item: OrderItem,
  menuItems: MenuItem[],
  lang: KitchenPrintLanguage,
): string {
  const menu = resolveMenuItemForOrder(item, menuItems);
  if (menu) return menuItemDisplayName(menu, lang);
  return item.name;
}

function noteForLang(item: OrderItem, lang: KitchenPrintLanguage): string {
  const original = item.notes?.trim() ?? "";
  const translated = item.notesTranslated?.trim() ?? "";
  if (lang === "zh") return translated || original;
  return original || translated;
}

export type KitchenPrintSettings = Pick<
  AppSettings,
  | "kitchenPrintEnabled"
  | "kitchenPrintPrimaryLang"
  | "kitchenPrintSecondaryLang"
  | "receiptFontSize"
  | "receiptFontWeight"
  | "receiptFontFamily"
>;

export function buildKitchenTicketHtml(input: {
  tableLabel: string;
  orders: OrderItem[];
  menuItems: MenuItem[];
  primaryLang: KitchenPrintLanguage;
  secondaryLang: KitchenPrintLanguage | "none";
  stationLabel?: string;
}): string {
  const lines = aggregateDisplayItems(input.orders);
  const now = new Date();
  const time = now.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });

  const itemBlocks = lines
    .map((item) => {
      const primary = itemNameForLang(item, input.menuItems, input.primaryLang);
      const secondary =
        input.secondaryLang === "none"
          ? ""
          : itemNameForLang(item, input.menuItems, input.secondaryLang);
      const notePrimary = noteForLang(item, input.primaryLang);
      const noteSecondary =
        input.secondaryLang === "none" ? "" : noteForLang(item, input.secondaryLang);

      const showSecondary =
        input.secondaryLang !== "none" &&
        secondary &&
        secondary.trim().toLowerCase() !== primary.trim().toLowerCase();

      const noteHtml =
        notePrimary || noteSecondary
          ? `<div class="kitchen-note">
              ${notePrimary ? `<div class="kitchen-note-primary">※ ${escapeHtml(notePrimary)}</div>` : ""}
              ${
                noteSecondary &&
                noteSecondary.trim().toLowerCase() !== notePrimary.trim().toLowerCase()
                  ? `<div class="kitchen-note-secondary">${escapeHtml(noteSecondary)}</div>`
                  : ""
              }
            </div>`
          : "";

      return `
        <div class="kitchen-item">
          <div class="kitchen-item-row">
            <span class="kitchen-qty">${item.quantity}×</span>
            <span class="kitchen-name-primary">${escapeHtml(primary)}</span>
          </div>
          ${showSecondary ? `<div class="kitchen-name-secondary">${escapeHtml(secondary)}</div>` : ""}
          ${noteHtml}
        </div>`;
    })
    .join("");

  return `
    <style>
      .kitchen-ticket { width: 72mm; max-width: 72mm; font-family: sans-serif; color: #000; }
      .kitchen-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px; }
      .kitchen-table { font-size: 28px; font-weight: 900; letter-spacing: 0.04em; }
      .kitchen-meta { font-size: 12px; margin-top: 4px; }
      .kitchen-item { border-bottom: 1px dashed #000; padding: 8px 0; }
      .kitchen-item-row { display: flex; gap: 6px; align-items: flex-start; }
      .kitchen-qty { font-size: 22px; font-weight: 900; min-width: 2.2em; }
      .kitchen-name-primary { font-size: 22px; font-weight: 900; line-height: 1.2; }
      .kitchen-name-secondary { font-size: 13px; margin: 2px 0 0 2.4em; }
      .kitchen-note { margin: 4px 0 0 2.4em; }
      .kitchen-note-primary { font-size: 14px; font-weight: 700; }
      .kitchen-note-secondary { font-size: 11px; margin-top: 2px; }
      .kitchen-footer { margin-top: 10px; text-align: center; font-size: 11px; }
      .kitchen-message-box { border: 2px solid #000; padding: 10px 8px; margin-top: 8px; }
      .kitchen-message-zh { font-size: 22px; font-weight: 900; line-height: 1.35; text-align: center; }
      .kitchen-message-src { font-size: 12px; margin-top: 8px; text-align: center; }
    </style>
    <div class="kitchen-ticket">
      <div class="kitchen-header">
        <div class="kitchen-table">TABLE ${escapeHtml(input.tableLabel)}</div>
        <div class="kitchen-meta">${escapeHtml(input.stationLabel ?? "KITCHEN")} · ${escapeHtml(time)}</div>
        <div class="kitchen-meta">${langLabel(input.primaryLang)}${
          input.secondaryLang !== "none" ? ` / ${langLabel(input.secondaryLang)}` : ""
        }</div>
      </div>
      ${itemBlocks || `<div class="kitchen-item"><div class="kitchen-name-primary">—</div></div>`}
      <div class="kitchen-footer">*** NEW ORDER ***</div>
    </div>`;
}

export function buildKitchenMessageHtml(input: {
  tableLabel: string;
  message: string;
  messageZh: string;
}): string {
  const now = new Date();
  const time = now.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  const zh = input.messageZh.trim() || input.message.trim();
  const src = input.message.trim();

  return `
    <style>
      .kitchen-ticket { width: 72mm; max-width: 72mm; font-family: sans-serif; color: #000; }
      .kitchen-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px; }
      .kitchen-table { font-size: 28px; font-weight: 900; letter-spacing: 0.04em; }
      .kitchen-meta { font-size: 12px; margin-top: 4px; }
      .kitchen-message-box { border: 2px solid #000; padding: 12px 8px; margin-top: 8px; }
      .kitchen-message-zh { font-size: 22px; font-weight: 900; line-height: 1.35; text-align: center; }
      .kitchen-message-src { font-size: 12px; margin-top: 10px; text-align: center; }
      .kitchen-footer { margin-top: 10px; text-align: center; font-size: 11px; }
    </style>
    <div class="kitchen-ticket">
      <div class="kitchen-header">
        <div class="kitchen-table">TABLE ${escapeHtml(input.tableLabel)}</div>
        <div class="kitchen-meta">MESSAGE · ${escapeHtml(time)}</div>
      </div>
      <div class="kitchen-message-box">
        <div class="kitchen-message-zh">${escapeHtml(zh)}</div>
        ${
          src && src !== zh
            ? `<div class="kitchen-message-src">${escapeHtml(src)}</div>`
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

  const html = buildKitchenTicketHtml({
    tableLabel: input.tableLabel,
    orders: input.orders,
    menuItems: input.menuItems,
    primaryLang: input.settings.kitchenPrintPrimaryLang,
    secondaryLang: input.settings.kitchenPrintSecondaryLang,
    stationLabel: input.stationLabel,
  });

  await printReceiptHTML(html, {
    receiptFontSize: input.settings.receiptFontSize,
    receiptFontWeight: input.settings.receiptFontWeight,
    receiptFontFamily: input.settings.receiptFontFamily,
  });
}

export async function printKitchenMessage(input: {
  tableLabel: string;
  message: string;
  messageZh: string;
  settings: KitchenPrintSettings;
}): Promise<void> {
  if (!input.settings.kitchenPrintEnabled) return;
  const html = buildKitchenMessageHtml({
    tableLabel: input.tableLabel,
    message: input.message,
    messageZh: input.messageZh,
  });
  await printReceiptHTML(html, {
    receiptFontSize: input.settings.receiptFontSize,
    receiptFontWeight: input.settings.receiptFontWeight,
    receiptFontFamily: input.settings.receiptFontFamily,
  });
}
