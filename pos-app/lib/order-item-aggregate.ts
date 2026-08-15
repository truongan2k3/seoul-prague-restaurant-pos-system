import { resolveKitchenStatus } from "@/lib/auto-serve";
import { normalizeOrderItemStatus } from "@/lib/order-status";
import type { OrderItem } from "@/lib/types";

/** Same-minute wave so later appends stay separate tickets. */
function createdAtBucket(iso?: string): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

function modifiersKey(item: OrderItem): string {
  try {
    return JSON.stringify({
      modifiers: item.modifiers ?? null,
      selectedAddons: item.selectedAddons ?? null,
    });
  } catch {
    return "";
  }
}

function displayAggregateKey(item: OrderItem, includeOrderWave: boolean): string {
  return [
    item.menuItemId ?? "",
    item.name,
    item.notes ?? "",
    item.notesTranslated ?? "",
    String(item.price),
    item.station ?? "",
    normalizeOrderItemStatus(item.status),
    resolveKitchenStatus(item),
    item.isCancelled ? "1" : "0",
    item.cancelReason ?? "",
    modifiersKey(item),
    includeOrderWave ? createdAtBucket(item.createdAt) : "",
  ].join("\u0001");
}

function mergeAggregateRow(
  merged: OrderItem[],
  indexByKey: Map<string, number>,
  item: OrderItem,
  key: string,
): void {
  const existingIndex = indexByKey.get(key);

  if (existingIndex === undefined) {
    indexByKey.set(key, merged.length);
    const unitIds = item.id ? [item.id] : [];
    merged.push({
      ...item,
      quantity: item.quantity || 1,
      unitIds,
    });
    return;
  }

  const match = merged[existingIndex]!;
  match.quantity += item.quantity || 1;
  if (item.id) {
    match.unitIds = [...(match.unitIds ?? []), item.id];
  }
  if (item.createdAt && (!match.createdAt || item.createdAt < match.createdAt)) {
    match.createdAt = item.createdAt;
  }
  if (!match.id && item.id) match.id = item.id;
}

/**
 * Merge identical unit rows (same dish / notes / status / order wave) into one
 * display line with summed quantity. Preserves all DB ids in `unitIds`.
 */
export function aggregateDisplayItems(items: OrderItem[]): OrderItem[] {
  const merged: OrderItem[] = [];
  const indexByKey = new Map<string, number>();

  for (const item of items) {
    mergeAggregateRow(merged, indexByKey, item, displayAggregateKey(item, true));
  }

  return merged;
}

/**
 * POS order panel — merge identical lines regardless of send time; split only
 * when notes, modifiers, price, or kitchen status differ.
 */
export function aggregateOrderPanelItems(items: OrderItem[]): OrderItem[] {
  const merged: OrderItem[] = [];
  const indexByKey = new Map<string, number>();

  for (const item of items) {
    mergeAggregateRow(merged, indexByKey, item, displayAggregateKey(item, false));
  }

  return merged;
}

export function resolveUnitIds(item: OrderItem): string[] {
  if (item.unitIds && item.unitIds.length > 0) return item.unitIds;
  return item.id ? [item.id] : [];
}
