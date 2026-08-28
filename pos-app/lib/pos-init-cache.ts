import type { MenuCategoryRecord, MenuItem, RestaurantTable } from "@/lib/types";

const CACHE_KEY = "pos-init-cache-v1";
const CACHE_TTL_MS = 15 * 60 * 1000;

export interface PosInitCachePayload {
  cachedAt: number;
  tables: RestaurantTable[];
  menuItems: MenuItem[];
  categories: MenuCategoryRecord[];
}

function reviveTable(table: RestaurantTable): RestaurantTable {
  return {
    ...table,
    occupiedAt: table.occupiedAt ? new Date(table.occupiedAt) : undefined,
  };
}

export function readPosInitCache(now = Date.now()): PosInitCachePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PosInitCachePayload;
    if (!parsed.cachedAt || now - parsed.cachedAt > CACHE_TTL_MS) return null;
    return normalizePosInitCache(parsed);
  } catch {
    return null;
  }
}

/** Ignore TTL — used when live Supabase fetch is slow or times out. */
export function readPosInitCacheStale(): PosInitCachePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return normalizePosInitCache(JSON.parse(raw) as PosInitCachePayload);
  } catch {
    return null;
  }
}

function normalizePosInitCache(parsed: PosInitCachePayload): PosInitCachePayload | null {
  if (!parsed.cachedAt) return null;
  if (!Array.isArray(parsed.tables) || !Array.isArray(parsed.menuItems) || !Array.isArray(parsed.categories)) {
    return null;
  }
  return {
    cachedAt: parsed.cachedAt,
    tables: parsed.tables.map(reviveTable),
    menuItems: parsed.menuItems,
    categories: parsed.categories,
  };
}

export function patchPosInitCacheMenu(menuItems: MenuItem[]) {
  const existing = readPosInitCacheStale();
  if (!existing) return;
  writePosInitCache({
    tables: existing.tables,
    menuItems,
    categories: existing.categories,
  });
}

export function writePosInitCache(payload: Omit<PosInitCachePayload, "cachedAt">) {
  if (typeof window === "undefined") return;
  try {
    const next: PosInitCachePayload = {
      cachedAt: Date.now(),
      tables: payload.tables,
      menuItems: payload.menuItems,
      categories: payload.categories,
    };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or private mode — ignore.
  }
}

export function clearPosInitCache() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(CACHE_KEY);
}
