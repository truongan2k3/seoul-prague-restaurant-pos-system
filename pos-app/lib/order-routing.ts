import type { Station } from "@/lib/types";

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

export function deriveItemType(category: string): "food" | "drink" {
  const normalized = category.trim().toLowerCase();
  if (normalized.startsWith(BAR_CATEGORY_PREFIX) || BAR_CATEGORIES.has(normalized)) {
    return "drink";
  }
  return "food";
}
