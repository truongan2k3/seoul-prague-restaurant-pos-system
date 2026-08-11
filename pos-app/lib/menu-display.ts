import type { LanguageCode, MenuItem, OrderItem } from "@/lib/types";

export function menuItemDisplayName(item: MenuItem, language: LanguageCode): string {
  if (language === "cs") return item.nameCz.trim() || item.nameEn;
  if (language === "zh") return item.nameZh.trim() || item.nameEn;
  return item.nameEn;
}

export function menuItemDisplayDescription(
  item: MenuItem,
  language: LanguageCode,
): string | undefined {
  if (language === "cs") {
    return item.descriptionCz?.trim() || item.descriptionEn?.trim() || undefined;
  }
  if (language === "zh") {
    return item.descriptionZh?.trim() || item.descriptionEn?.trim() || undefined;
  }
  return item.descriptionEn?.trim() || undefined;
}

/** Match order line to menu item across all localized names */
export function menuItemMatchesOrderName(item: MenuItem, orderName: string): boolean {
  const target = orderName.toLowerCase();
  return [item.nameEn, item.nameCz, item.nameZh].some(
    (name) => name.trim().toLowerCase() === target,
  );
}

export function resolveMenuItemForOrder(
  order: Pick<OrderItem, "menuItemId" | "name">,
  menuItems: MenuItem[],
): MenuItem | undefined {
  if (order.menuItemId) {
    const byId = menuItems.find((m) => m.id === order.menuItemId);
    if (byId) return byId;
  }
  return menuItems.find((m) => menuItemMatchesOrderName(m, order.name));
}

export function orderItemDisplayName(
  order: Pick<OrderItem, "menuItemId" | "name">,
  menuItems: MenuItem[],
  language: LanguageCode,
): string {
  const menu = resolveMenuItemForOrder(order, menuItems);
  if (menu) return menuItemDisplayName(menu, language);
  return order.name;
}

/** Primary = active UI language; secondary = Chinese (or English when zh is active). */
export function orderItemDualDisplay(
  order: Pick<OrderItem, "menuItemId" | "name">,
  menuItems: MenuItem[],
  language: LanguageCode,
): { primary: string; secondary: string | null } {
  const menu = resolveMenuItemForOrder(order, menuItems);
  if (!menu) {
    return { primary: order.name, secondary: null };
  }

  const primary = menuItemDisplayName(menu, language);
  const secondary =
    language === "zh"
      ? menu.nameEn.trim() || null
      : menu.nameZh.trim() || null;

  if (!secondary || secondary === primary) {
    return { primary, secondary: null };
  }

  return { primary, secondary };
}

export function cartLineDisplayName(
  line: { menuItemId?: string; name: string },
  menuItems: MenuItem[],
  language: LanguageCode,
): string {
  return orderItemDisplayName(line, menuItems, language);
}
