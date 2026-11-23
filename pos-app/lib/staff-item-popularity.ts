import { venueParts } from "@/lib/venue-timezone";
import type { MenuItem, MenuSortMode } from "@/lib/types";
import { supabase } from "@/src/lib/supabase";

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

/**
 * Merges incoming click counts into localStorage and returns the updated map.
 */
export function mergeStaffItemClickCounts(
  incoming: Record<string, number>,
): Record<string, number> {
  if (!incoming || typeof incoming !== "object") return getStaffItemClickCounts();
  const current = getStaffItemClickCounts();
  let changed = false;
  for (const [id, count] of Object.entries(incoming)) {
    const val = Number(count) || 0;
    if (val > (current[id] ?? 0)) {
      current[id] = val;
      changed = true;
    }
  }
  if (changed && typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(POS_STAFF_ITEM_CLICKS_KEY, JSON.stringify(current));
    } catch {}
  }
  return current;
}

/**
 * Sums counts from incoming into target without mutating target.
 */
export function mergeSentCounts(
  target: Record<string, number>,
  incoming: Record<string, number>,
): Record<string, number> {
  const result = { ...target };
  for (const [id, count] of Object.entries(incoming)) {
    result[id] = (result[id] ?? 0) + (Number(count) || 0);
  }
  return result;
}

/**
 * Sums up the exact sent quantities for each menu item from an array of order lines.
 * Ignores cancelled orders and matches by menuItemId or item name.
 */
export function aggregateItemSentCounts(
  orders: Array<{ menuItemId?: string; name?: string; quantity?: number; isCancelled?: boolean }>,
  menuItems?: MenuItem[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!orders || orders.length === 0) return counts;

  const nameToId = new Map<string, string>();
  if (menuItems) {
    for (const m of menuItems) {
      if (m.nameEn) nameToId.set(m.nameEn.toLowerCase().trim(), m.id);
      if (m.nameCz) nameToId.set(m.nameCz.toLowerCase().trim(), m.id);
      if (m.nameZh) nameToId.set(m.nameZh.toLowerCase().trim(), m.id);
    }
  }

  for (const order of orders) {
    if (order.isCancelled) continue;
    let itemId = order.menuItemId;
    if (!itemId && order.name) {
      itemId = nameToId.get(order.name.toLowerCase().trim());
    }
    if (!itemId) continue;
    const qty = Math.max(1, order.quantity ?? 1);
    counts[itemId] = (counts[itemId] ?? 0) + qty;
  }
  return counts;
}

let cachedSalesCounts: Record<string, number> | null = null;
let lastSalesFetchAt = 0;
const SALES_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

/**
 * Fetches recent completed sales from Supabase to get real historical item sent quantities.
 * Cached for 10 minutes to minimize database egress.
 */
export async function fetchRecentSentItemCounts(
  menuItems?: MenuItem[],
): Promise<Record<string, number>> {
  if (typeof window === "undefined") return {};
  if (cachedSalesCounts && Date.now() - lastSalesFetchAt < SALES_CACHE_TTL_MS) {
    return cachedSalesCounts;
  }
  try {
    const { data, error } = await supabase
      .from("sales")
      .select("items")
      .order("closed_at", { ascending: false })
      .limit(150);

    if (error || !data) {
      return cachedSalesCounts ?? {};
    }

    const allSaleOrders: Array<{ menuItemId?: string; name?: string; quantity?: number; isCancelled?: boolean }> = [];
    for (const row of data) {
      const items = (row.items as Array<{ menuItemId?: string; name?: string; quantity?: number; isCancelled?: boolean }>) ?? [];
      allSaleOrders.push(...items);
    }

    const counts = aggregateItemSentCounts(allSaleOrders, menuItems);
    cachedSalesCounts = counts;
    lastSalesFetchAt = Date.now();
    return counts;
  } catch {
    return cachedSalesCounts ?? {};
  }
}

/**
 * Combines sent quantities from:
 * 1. Completed sales bills (historical bestsellers)
 * 2. Active tables in the restaurant (current shift orders)
 * 3. Local staff session sends
 */
export function getCombinedItemSentCounts(
  activeOrderItems?: Array<{ menuItemId?: string; name?: string; quantity?: number; isCancelled?: boolean }>,
  menuItems?: MenuItem[],
  salesCounts?: Record<string, number>,
): Record<string, number> {
  const localSessionCounts = getStaffItemClickCounts();
  const activeCounts = aggregateItemSentCounts(activeOrderItems ?? [], menuItems);
  let total = mergeSentCounts(salesCounts ?? cachedSalesCounts ?? {}, localSessionCounts);
  total = mergeSentCounts(total, activeCounts);
  return total;
}

/**
 * Seed counts from active restaurant orders if local storage is low or empty.
 */
export function seedStaffItemClickCounts(
  orders: Array<{ menuItemId?: string; quantity?: number }>,
): Record<string, number> {
  if (!orders || orders.length === 0) return getStaffItemClickCounts();
  const current = getStaffItemClickCounts();
  let changed = false;
  for (const order of orders) {
    if (!order.menuItemId) continue;
    const qty = Math.max(1, order.quantity ?? 1);
    current[order.menuItemId] = (current[order.menuItemId] ?? 0) + qty;
    changed = true;
  }
  if (changed && typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(POS_STAFF_ITEM_CLICKS_KEY, JSON.stringify(current));
    } catch {}
  }
  return current;
}

/**
 * Sort menu items for the default Top / All view:
 * 1. Items with popularity count > 0 sort descending by count (most popular first).
 * 2. Items with equal counts sort by category order (configured category sequence).
 * 3. Within same category, sort by item sortOrder (custom display order) or name.
 */
export function sortTopMenuItems(
  items: MenuItem[],
  popularityMap: Record<string, number>,
  categoryOptions: Array<{ id: string; name?: string }>,
  mode: MenuSortMode = "custom",
): MenuItem[] {
  const categoryIndexMap = new Map<string, number>();
  categoryOptions.forEach((cat, index) => {
    categoryIndexMap.set(cat.id, index);
    if (cat.name) categoryIndexMap.set(cat.name, index);
  });

  return [...items].sort((a, b) => {
    const countA = popularityMap[a.id] ?? 0;
    const countB = popularityMap[b.id] ?? 0;

    // 1. Higher popularity count comes first
    if (countA !== countB) {
      return countB - countA;
    }

    // 2. Tie-break: Category order (defined by restaurant categories)
    const catOrderA =
      categoryIndexMap.get(a.categoryId ?? "") ??
      categoryIndexMap.get(typeof a.category === "string" ? a.category : "") ??
      999;
    const catOrderB =
      categoryIndexMap.get(b.categoryId ?? "") ??
      categoryIndexMap.get(typeof b.category === "string" ? b.category : "") ??
      999;
    if (catOrderA !== catOrderB) {
      return catOrderA - catOrderB;
    }

    // 3. Within same category: item sortOrder
    if (mode === "alphabetical") {
      return a.nameEn.localeCompare(b.nameEn, undefined, { sensitivity: "base" });
    }

    const sortDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (sortDiff !== 0) return sortDiff;

    return a.nameEn.localeCompare(b.nameEn, undefined, { sensitivity: "base" });
  });
}
