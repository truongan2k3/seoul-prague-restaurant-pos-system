import type { MenuItem, OrderItem, Station } from "@/lib/types";

const BAR_CATEGORY_PREFIX = "drinks";

const BAR_CATEGORIES = new Set(["drink", "drinks", "beverage", "beverages"]);

export function resolveStation(
  category: string,
  itemType?: "food" | "drink",
): Station {
  if (itemType === "drink") return "bar";
  const normalized = category.trim().toLowerCase();
  if (normalized.startsWith(BAR_CATEGORY_PREFIX) || BAR_CATEGORIES.has(normalized)) {
    return "bar";
  }
  return "kitchen";
}

export function resolveOrderLineStation(line: {
  station?: Station;
  category: string;
  itemType?: "food" | "drink";
}): Station {
  if (line.station) return line.station;
  return resolveStation(line.category, line.itemType);
}

export function deriveItemType(category: string): "food" | "drink" {
  const normalized = category.trim().toLowerCase();
  if (normalized.startsWith(BAR_CATEGORY_PREFIX) || BAR_CATEGORIES.has(normalized)) {
    return "drink";
  }
  return "food";
}

export function isDrinkOrderItem(
  item: Pick<OrderItem, "itemType" | "station" | "menuItemId">,
  menuItems: Pick<MenuItem, "id" | "itemType" | "station">[] = [],
): boolean {
  if (item.itemType === "drink") return true;
  if (item.itemType === "food") return false;
  if (item.station === "bar") return true;
  if (item.menuItemId) {
    const menu = menuItems.find((entry) => entry.id === item.menuItemId);
    if (menu?.itemType === "drink" || menu?.station === "bar") return true;
  }
  return false;
}
