import type { MenuItem, OrderItem } from "@/lib/types";

export const GRILL_SETS_CATEGORY = "Grill Sets";
export const BBQ_GRILL_CATEGORY = "BBQ Grill";
export const GRILL_GUEST_PREP_NOTE_ZH_PREFIX = "准备烤肉蘸料";

export function isGrillSetCategory(category: string | undefined): boolean {
  return category === GRILL_SETS_CATEGORY;
}

export function isBbqGrillCategory(category: string | undefined): boolean {
  return category === BBQ_GRILL_CATEGORY;
}

export function isGrillCategory(category: string | undefined): boolean {
  return isBbqGrillCategory(category) || isGrillSetCategory(category);
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
  if (tableHasGrillItems(options.existingOrders, options.menuItems)) return false;
  if (options.existingOrders.some(isGrillGuestPrepOrder)) return false;
  return true;
}

export function buildGrillGuestPrepOrder(guestCount: number): OrderItem {
  return {
    name: "BBQ dipping sauce prep",
    price: 0,
    quantity: 1,
    notes: `Prepare dipping sauce for ${guestCount} guest${guestCount === 1 ? "" : "s"}`,
    notesTranslated: `${GRILL_GUEST_PREP_NOTE_ZH_PREFIX} · ${guestCount}位`,
    isPrintedNote: false,
    station: "kitchen",
    status: "preparing",
  };
}

/** @deprecated Use cartHasGrillItems */
export function cartHasBbqGrillItems(cart: { category: string }[]): boolean {
  return cartHasGrillItems(cart);
}
