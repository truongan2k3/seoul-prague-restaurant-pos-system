export const POS_SOFT_REFRESH_EVENT = "pos-soft-refresh";
export const POS_DATA_SYNCED_EVENT = "pos-data-synced";

export function requestPosSoftRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(POS_SOFT_REFRESH_EVENT));
}

export function notifyPosDataSynced(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(POS_DATA_SYNCED_EVENT));
}

export function subscribePosSoftRefresh(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(POS_SOFT_REFRESH_EVENT, handler);
  return () => window.removeEventListener(POS_SOFT_REFRESH_EVENT, handler);
}

export function subscribePosDataSynced(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(POS_DATA_SYNCED_EVENT, handler);
  return () => window.removeEventListener(POS_DATA_SYNCED_EVENT, handler);
}
