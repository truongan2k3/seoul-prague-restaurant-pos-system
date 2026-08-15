import {
  buildKitchenModifierText,
  buildKitchenModifierTextEn,
  kitchenPrintOptions,
} from "@/lib/menu-customization";
import { menuItemDisplayName, resolveMenuItemForOrder } from "@/lib/menu-display";
import {
  grillGuestCountFromPrepOrder,
  isGrillGuestPrepOrder,
} from "@/lib/grill-guest-count";
import type { MenuItem, OrderItem } from "@/lib/types";

function isRiceNoteSegment(segment: string): boolean {
  const trimmed = segment.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  return (
    trimmed === "米饭" ||
    lower.includes("rice (included)") ||
    lower === "rice" ||
    trimmed === "Rýže (v ceně)"
  );
}

export function stripIncludedRiceFromNote(note: string): string {
  if (!note.trim()) return "";
  return note
    .split(" · ")
    .map((part) => part.trim())
    .filter((part) => part && !isRiceNoteSegment(part))
    .join(" · ");
}

function stripKitchenAddonFromNote(note: string, addon: string): string {
  const trimmed = note.trim();
  const addonTrimmed = addon.trim();
  if (!trimmed || !addonTrimmed) return trimmed;

  const parts = trimmed.split(" · ").map((part) => part.trim()).filter(Boolean);
  const addonParts = addonTrimmed.split(" · ").map((part) => part.trim()).filter(Boolean);
  const addonSet = new Set(addonParts.map((part) => part.toLowerCase()));

  const remaining = parts.filter((part) => !addonSet.has(part.toLowerCase()));
  return remaining.join(" · ");
}

function joinKitchenSegments(...parts: Array<string | undefined>): string {
  return parts.map((part) => part?.trim()).filter(Boolean).join(" · ");
}

function dishNames(item: OrderItem, menuItems: MenuItem[]): { zh: string; en: string } {
  if (isGrillGuestPrepOrder(item)) {
    return { zh: "", en: "" };
  }
  const menu = resolveMenuItemForOrder(item, menuItems);
  const zh = menu?.nameZh?.trim() || (menu ? menuItemDisplayName(menu, "zh") : item.name);
  const en = menu?.nameEn?.trim() || item.name;
  return { zh, en };
}

function saucePrepLines(item: OrderItem): { primary: string; secondary: string } {
  const count = grillGuestCountFromPrepOrder(item);
  const zhNote = stripIncludedRiceFromNote(item.notesTranslated?.trim() ?? "");
  const enNote = stripIncludedRiceFromNote(item.notes?.trim() ?? "");

  if (zhNote || enNote) {
    return { primary: zhNote, secondary: enNote };
  }

  if (count) {
    return {
      primary: `准备烤肉蘸料 · ${count}位`,
      secondary: `Prepare dipping sauce for ${count} guest${count === 1 ? "" : "s"}`,
    };
  }

  return { primary: "准备烤肉蘸料", secondary: "Prepare dipping sauce for guests" };
}

export interface KitchenTicketItemDisplay {
  kind: "sauce-prep" | "dish";
  quantity: number;
  primary: string;
  secondary: string;
  noteZh: string;
  noteEn: string;
}

export function resolveKitchenTicketItemDisplay(
  item: OrderItem,
  menuItems: MenuItem[],
): KitchenTicketItemDisplay | null {
  if (isGrillGuestPrepOrder(item)) {
    const { primary, secondary } = saucePrepLines(item);
    if (!primary && !secondary) return null;
    return {
      kind: "sauce-prep",
      quantity: 0,
      primary,
      secondary,
      noteZh: "",
      noteEn: "",
    };
  }

  const selected = kitchenPrintOptions(item.modifiers?.selectedOptions);
  const addonZh = buildKitchenModifierText(selected);
  const addonEn = buildKitchenModifierTextEn(selected);

  const { zh: dishZh, en: dishEn } = dishNames(item, menuItems);

  let noteZh = stripIncludedRiceFromNote(item.notesTranslated?.trim() ?? "");
  let noteEn = stripIncludedRiceFromNote(item.notes?.trim() ?? "");
  noteZh = stripKitchenAddonFromNote(noteZh, addonZh);
  noteEn = stripKitchenAddonFromNote(noteEn, addonEn);

  const primary = joinKitchenSegments(dishZh, addonZh);
  const secondary = joinKitchenSegments(dishEn, addonEn);

  if (!primary && !secondary && !noteZh && !noteEn) return null;

  return {
    kind: "dish",
    quantity: item.quantity || 1,
    primary,
    secondary,
    noteZh,
    noteEn,
  };
}
