/** Persist item-split checkout UI across PaymentModal remounts / table refresh. */

export type ItemSplitSessionState = {
  active: true;
  mode: "items";
};

function storageKey(tableId: string) {
  return `pos-item-split:${tableId}`;
}

export function loadItemSplitSession(tableId?: string | null): ItemSplitSessionState | null {
  if (!tableId || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(tableId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ItemSplitSessionState;
    if (!parsed || parsed.mode !== "items" || parsed.active !== true) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistItemSplitSession(tableId: string | undefined) {
  if (!tableId || typeof window === "undefined") return;
  try {
    const state: ItemSplitSessionState = { active: true, mode: "items" };
    window.sessionStorage.setItem(storageKey(tableId), JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

export function clearItemSplitSession(tableId?: string | null) {
  if (!tableId || typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey(tableId));
  } catch {
    // ignore
  }
}
