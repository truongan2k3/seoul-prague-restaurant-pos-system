import { venueParts } from "@/lib/venue-timezone";

export const POS_STAFF_ITEM_CLICKS_KEY = "pos_staff_item_clicks";

/**
 * Normalized lunch categories restricted from the Top menu list
 * during evening hours (16:00 - 01:00) and all day on weekends (Sat & Sun).
 */
export const RESTRICTED_LUNCH_CATEGORIES = new Set<string>([
  "polevka",
  "hlavni jidlo",
  "vietnamska",
  "nudle a ryze",
  "kachna/kureci kousky",
]);

/**
 * Strips accents/diacritics, lowercases, and normalizes spacing and slashes.
 * e.g. "Polévka" -> "polevka", "Hlavní jídlo" -> "hlavni jidlo", "Kachna/Kuřecí kousky" -> "kachna/kureci kousky"
 */
export function normalizeCategoryKey(name?: string | null): string {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns true if the category is one of the 5 lunch categories:
 * polevka, hlavni jidlo, vietnamska, nudle a ryze, kachna/kureci kousky.
 */
export function isRestrictedLunchCategory(categoryName?: string | null): boolean {
  const normalized = normalizeCategoryKey(categoryName);
  if (!normalized) return false;
  if (RESTRICTED_LUNCH_CATEGORIES.has(normalized)) return true;
  // Fallbacks for slight naming variations
  if (normalized === "polevka" || normalized === "polevky") return true;
  if (normalized.startsWith("hlavni jidlo")) return true;
  if (normalized.startsWith("vietnamska")) return true;
  if (normalized === "nudle a ryze") return true;
  if (normalized.includes("kachna") && normalized.includes("kureci")) return true;
  return false;
}

/**
 * Checks whether the current Prague wall-clock time is restricted for lunch categories:
 * - Daily from 16:00 to 01:00
 * - Saturday and Sunday: all day
 */
export function isLunchRestrictionActive(now = new Date()): boolean {
  const parts = venueParts(now);
  // Saturday and Sunday: restricted all day
  if (parts.weekday === "Sat" || parts.weekday === "Sun") {
    return true;
  }
  // Daily between 16:00 and 01:00 (16:00 - 23:59 or 00:00 - 00:59)
  return parts.hour >= 16 || parts.hour < 1;
}

/**
 * Read item click counts recorded by staff on this POS device.
 */
export function getStaffItemClickCounts(): Record<string, number> {
  if (typeof window === "undefined" || !window.localStorage) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(POS_STAFF_ITEM_CLICKS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Increment counts for items in an order that was actually sent or saved by staff.
 * Items that are simply added to cart but discarded/not sent will not be counted.
 */
export function recordStaffOrderItems(
  items: Array<{ menuItemId?: string; quantity?: number }>,
): void {
  if (!items || items.length === 0 || typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    const counts = getStaffItemClickCounts();
    for (const item of items) {
      if (!item.menuItemId) continue;
      const qty = Math.max(1, item.quantity ?? 1);
      counts[item.menuItemId] = (counts[item.menuItemId] ?? 0) + qty;
    }
    window.localStorage.setItem(POS_STAFF_ITEM_CLICKS_KEY, JSON.stringify(counts));
  } catch {}
}

/**
 * Increment click count for an item (single item helper).
 */
export function recordStaffItemClick(itemId: string, qty = 1): void {
  if (!itemId) return;
  recordStaffOrderItems([{ menuItemId: itemId, quantity: qty }]);
}
