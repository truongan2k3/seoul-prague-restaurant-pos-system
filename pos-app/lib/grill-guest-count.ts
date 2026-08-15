import type { MenuItem, OrderItem } from "@/lib/types";

/** Legacy JIN CHENG menu category names. */
export const GRILL_SETS_CATEGORY = "Grill Sets";
export const BBQ_GRILL_CATEGORY = "BBQ Grill";

/** Excel / current menu — grill sets (e.g. Grilovací set na uhlí). */
export const GRILL_SET_CATEGORY_NAMES = new Set([
  GRILL_SETS_CATEGORY,
  "Grilovací set na uhlí",
]);

/** Excel / current menu — individual BBQ items (Prémiové hovězí, Vepřové/Kuřecí, …). */
export const BBQ_GRILL_CATEGORY_NAMES = new Set([
  BBQ_GRILL_CATEGORY,
  "Prémiové hovězí",
  "Vepřové/Kuřecí",
  "Mořské plody/Zelenina",
]);

export const GRILL_GUEST_PREP_NOTE_ZH_PREFIX = "准备烤肉蘸料";

function normalizeCategory(category: string | undefined): string {
  return category?.trim() ?? "";
}

export function isGrillSetCategory(category: string | undefined): boolean {
  return GRILL_SET_CATEGORY_NAMES.has(normalizeCategory(category));
}

export function isBbqGrillCategory(category: string | undefined): boolean {
  return BBQ_GRILL_CATEGORY_NAMES.has(normalizeCategory(category));
}

export function isGrillCategory(category: string | undefined): boolean {
  return isGrillSetCategory(category) || isBbqGrillCategory(category);
}

export function isGrillSetMenuItem(item: MenuItem): boolean {
  return isGrillSetCategory(item.category);
}

export function isBbqGrillMenuItem(item: MenuItem): boolean {
  return isBbqGrillCategory(item.category);
}

export function isGrillMenuItem(item: MenuItem): boolean {
  return isGrillCategory(item.category);
}

export function isGrillGuestPrepOrder(order: OrderItem): boolean {
  const notes = order.notes?.toLowerCase() ?? "";
  const notesZh = order.notesTranslated ?? "";
  const name = order.name.toLowerCase();
  return (
    notesZh.includes(GRILL_GUEST_PREP_NOTE_ZH_PREFIX) ||
    notes.includes("bbq dipping sauce") ||
    notes.includes("grill guest") ||
    notes.includes("omáčku ke grilu") ||
    name.includes("bbq dipping sauce") ||
    name.includes("grill sauce prep")
  );
}

function orderIsGrillItem(order: OrderItem, menuItems: MenuItem[]): boolean {
  if (isGrillGuestPrepOrder(order)) return false;
  const menu = order.menuItemId ? menuItems.find((item) => item.id === order.menuItemId) : undefined;
  return isGrillCategory(menu?.category);
}

export function tableHasGrillItems(orders: OrderItem[], menuItems: MenuItem[]): boolean {
  return orders.some((order) => orderIsGrillItem(order, menuItems));
}

/** @deprecated Use tableHasGrillItems */
export function tableHasGrillSet(orders: OrderItem[], menuItems: MenuItem[]): boolean {
  return tableHasGrillItems(orders, menuItems);
}

export function cartHasGrillItems(cart: { category: string }[]): boolean {
  return cart.some((line) => isGrillCategory(line.category));
}

/** @deprecated Use cartHasGrillItems */
export function cartHasGrillSet(cart: { category: string }[]): boolean {
  return cartHasGrillItems(cart);
}

/** Ask guest count once per table session — first grill/set item only. */
export function shouldPromptGrillGuestCount(options: {
  item: MenuItem;
  cart: { category: string }[];
  existingOrders: OrderItem[];
  menuItems: MenuItem[];
  guestCountCollected: boolean;
}): boolean {
  if (!isGrillMenuItem(options.item)) return false;
  if (options.guestCountCollected) return false;
  if (cartHasGrillItems(options.cart)) return false;
  if (options.existingOrders.some(isGrillGuestPrepOrder)) return false;
  if (tableHasGrillItems(options.existingOrders, options.menuItems)) return false;
  return true;
}

export function grillGuestCountFromPrepOrder(order: OrderItem): number | null {
  const zhMatch = order.notesTranslated?.match(/(\d+)位/);
  if (zhMatch) return Number(zhMatch[1]);
  const enMatch = order.notes?.match(/(\d+)\s+guest/i);
  if (enMatch) return Number(enMatch[1]);
  return null;
}

export function buildGrillGuestPrepOrder(guestCount: number): OrderItem {
  const safeCount = Math.max(1, Math.floor(guestCount));
  return {
    name: "BBQ dipping sauce prep",
    price: 0,
    quantity: 1,
    notes: `Prepare dipping sauce for ${safeCount} guest${safeCount === 1 ? "" : "s"}`,
    notesTranslated: `${GRILL_GUEST_PREP_NOTE_ZH_PREFIX} · ${safeCount}位`,
    isPrintedNote: false,
    station: "kitchen",
    status: "preparing",
  };
}

/** @deprecated Use cartHasGrillItems */
export function cartHasBbqGrillItems(cart: { category: string }[]): boolean {
  return cartHasGrillItems(cart);
}
