/**
 * Deduplication & Leader Election for Kitchen Printing
 * Prevents duplicate ticket printing across multiple tabs, page reloads, and redundant events.
 */

const PRINT_ITEM_KEY = "pos:kitchen-print:claimed-items:v1";
const PRINT_MSG_KEY = "pos:kitchen-print:claimed-messages:v1";
const PRINT_LEADER_KEY = "pos:kitchen-print:leader-tab:v1";

const MEMORY_ITEMS = new Set<string>();
const MEMORY_MESSAGES = new Set<string>();
const MAX_DEDUPE_ENTRIES = 1500;
const DEDUPE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function canUseStorage(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined" &&
    typeof window.localStorage.getItem === "function"
  );
}

function loadClaimedMap(storageKey: string): Map<string, number> {
  const map = new Map<string, number>();
  if (!canUseStorage()) return map;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return map;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const now = Date.now();
      for (const [id, ts] of Object.entries(parsed)) {
        if (typeof ts === "number" && now - ts < DEDUPE_TTL_MS) {
          map.set(id, ts);
        }
      }
    }
  } catch {
    /* fallback to memory */
  }
  return map;
}

function saveClaimedMap(storageKey: string, map: Map<string, number>): void {
  if (!canUseStorage()) return;
  try {
    const obj: Record<string, number> = {};
    const entries = [...map.entries()].slice(-MAX_DEDUPE_ENTRIES);
    for (const [id, ts] of entries) {
      obj[id] = ts;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(obj));
  } catch {
    /* ignore storage quota errors */
  }
}

/**
 * Claim an order item ID before printing.
 * Returns true if this is the first time the item is claimed (should print).
 * Returns false if the item was already claimed/printed by this or another tab.
 */
export function claimKitchenPrintItemId(id: string): boolean {
  if (!id) return false;
  if (MEMORY_ITEMS.has(id)) return false;

  const map = loadClaimedMap(PRINT_ITEM_KEY);
  if (map.has(id)) {
    MEMORY_ITEMS.add(id);
    return false;
  }

  const now = Date.now();
  map.set(id, now);
  MEMORY_ITEMS.add(id);
  if (MEMORY_ITEMS.size > MAX_DEDUPE_ENTRIES) {
    const first = MEMORY_ITEMS.values().next().value;
    if (first) MEMORY_ITEMS.delete(first);
  }

  saveClaimedMap(PRINT_ITEM_KEY, map);
  return true;
}

/**
 * Checks if an order item ID has already been claimed/printed.
 */
export function hasKitchenPrintItemIdBeenClaimed(id: string): boolean {
  if (!id) return false;
  if (MEMORY_ITEMS.has(id)) return true;
  const map = loadClaimedMap(PRINT_ITEM_KEY);
  if (map.has(id)) {
    MEMORY_ITEMS.add(id);
    return true;
  }
  return false;
}

/**
 * Filter an array of OrderItems to only those not yet claimed/printed.
 * Claims all returned items so no other tab or subsequent event prints them.
 */
export function filterAndClaimUnprintedOrders<T extends { id?: string; unitIds?: string[] }>(orders: T[]): T[] {
  return orders.filter((order) => {
    const ids = order.unitIds?.length ? order.unitIds : order.id ? [order.id] : [];
    if (ids.length === 0) return true; // No durable IDs, let it pass
    const unprintedIds = ids.filter((id) => !hasKitchenPrintItemIdBeenClaimed(id));
    if (unprintedIds.length === 0) return false; // All IDs in this order already printed
    unprintedIds.forEach((id) => claimKitchenPrintItemId(id));
    return true;
  });
}

/**
 * Claim a kitchen message by unique key (jobId or hash) before printing.
 * Returns true if first time (should print), false if duplicate.
 */
export function claimKitchenPrintMessage(messageKey: string): boolean {
  if (!messageKey) return false;
  if (MEMORY_MESSAGES.has(messageKey)) return false;

  const map = loadClaimedMap(PRINT_MSG_KEY);
  if (map.has(messageKey)) {
    MEMORY_MESSAGES.add(messageKey);
    return false;
  }

  const now = Date.now();
  map.set(messageKey, now);
  MEMORY_MESSAGES.add(messageKey);
  if (MEMORY_MESSAGES.size > MAX_DEDUPE_ENTRIES) {
    const first = MEMORY_MESSAGES.values().next().value;
    if (first) MEMORY_MESSAGES.delete(first);
  }

  saveClaimedMap(PRINT_MSG_KEY, map);
  return true;
}

/**
 * Tab Leader Election for Print Station:
 * Ensures only ONE browser tab on this device is the active print coordinator.
 */
const LEADER_TIMEOUT_MS = 6000;

export function registerPrintStationTab(tabId: string): {
  isLeader: () => boolean;
  heartbeat: () => boolean;
  resign: () => void;
} {
  const tryAcquireOrRenew = (): boolean => {
    if (!canUseStorage()) return true;
    try {
      const now = Date.now();
      const raw = window.localStorage.getItem(PRINT_LEADER_KEY);
      if (!raw) {
        window.localStorage.setItem(PRINT_LEADER_KEY, JSON.stringify({ tabId, at: now }));
        return true;
      }
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") {
        window.localStorage.setItem(PRINT_LEADER_KEY, JSON.stringify({ tabId, at: now }));
        return true;
      }
      if (data.tabId === tabId) {
        // Renew lease
        window.localStorage.setItem(PRINT_LEADER_KEY, JSON.stringify({ tabId, at: now }));
        return true;
      }
      if (now - Number(data.at) > LEADER_TIMEOUT_MS) {
        // Previous leader lease expired, take over
        window.localStorage.setItem(PRINT_LEADER_KEY, JSON.stringify({ tabId, at: now }));
        return true;
      }
      // Another tab is actively holding the leader lease
      return false;
    } catch {
      return true;
    }
  };

  const resign = () => {
    if (!canUseStorage()) return;
    try {
      const raw = window.localStorage.getItem(PRINT_LEADER_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data?.tabId === tabId) {
          window.localStorage.removeItem(PRINT_LEADER_KEY);
        }
      }
    } catch {
      /* ignore */
    }
  };

  return {
    isLeader: tryAcquireOrRenew,
    heartbeat: tryAcquireOrRenew,
    resign,
  };
}
