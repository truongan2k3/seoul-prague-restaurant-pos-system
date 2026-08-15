import { isBillOnlyOrderLine } from "@/lib/menu-item-dispatch";
import { aggregateOrderPanelItems } from "@/lib/order-item-aggregate";
import { resolveOriginalUnitPrice } from "@/lib/order-line-pricing";
import type { MenuItem, OrderItem } from "@/lib/types";

export type EditableLine = OrderItem & { lineId: string };

function expandEditableLineToUnits(line: EditableLine): OrderItem[] {
  const { lineId: _lineId, unitIds, ...rest } = line;
  const qty = Math.max(0, rest.quantity || 0);
  if (qty === 0) return [];

  const ids = unitIds?.length ? unitIds : rest.id ? [rest.id] : [];

  if (ids.length >= qty) {
    return ids.slice(0, qty).map((id) => ({
      ...rest,
      quantity: 1,
      id,
      unitIds: undefined,
    }));
  }

  if (ids.length > 0) {
    const units: OrderItem[] = ids.map((id) => ({
      ...rest,
      quantity: 1,
      id,
      unitIds: undefined,
    }));
    for (let index = ids.length; index < qty; index += 1) {
      units.push({ ...rest, quantity: 1, id: undefined, unitIds: undefined });
    }
    return units;
  }

  return Array.from({ length: qty }, (_, index) => ({
    ...rest,
    quantity: 1,
    id: index === 0 ? rest.id : undefined,
    unitIds: undefined,
  }));
}

export function toEditableLines(
  orderItems: OrderItem[],
  fallbackOrders: OrderItem[],
  menuItems: MenuItem[],
  options?: { aggregate?: boolean },
): EditableLine[] {
  const raw = orderItems.length > 0 ? orderItems : fallbackOrders;
  const source =
    options?.aggregate === false ? raw : aggregateOrderPanelItems(raw);

  return source.map((item, index) => {
    const originalPrice = resolveOriginalUnitPrice(item, menuItems);
    const lineId = item.unitIds?.length
      ? `agg-${item.unitIds.join("+")}`
      : item.id
        ? `${item.id}::${index}`
        : `line-${index}-${item.menuItemId ?? "x"}-${item.name}-${item.notes ?? ""}-${item.price}-${item.station ?? ""}`;

    return {
      ...item,
      originalPrice,
      price: item.price,
      lineId,
    };
  });
}

export function editableLinesToOrders(lines: EditableLine[]): OrderItem[] {
  return lines
    .filter((item) => item.quantity > 0)
    .flatMap((line) => expandEditableLineToUnits(line));
}

function aggregatedCompareKey(item: OrderItem): string {
  const ids = [...(item.unitIds ?? (item.id ? [item.id] : []))].sort().join(",");
  return [
    ids,
    item.menuItemId ?? "",
    item.name,
    item.price,
    String(item.quantity),
    item.notes ?? "",
    item.notesTranslated ?? "",
    JSON.stringify(item.modifiers ?? null),
    item.status ?? "",
    item.kitchenStatus ?? "",
  ].join("|");
}

/** True when current draft differs from last saved baseline. */
export function submittedOrdersDirty(current: OrderItem[], baseline: OrderItem[]): boolean {
  const currentKeys = aggregateOrderPanelItems(current).map(aggregatedCompareKey).sort();
  const baselineKeys = aggregateOrderPanelItems(baseline).map(aggregatedCompareKey).sort();
  if (currentKeys.length !== baselineKeys.length) return true;
  return currentKeys.some((key, index) => key !== baselineKeys[index]);
}

export function isSubmittedLineDirty(line: OrderItem, baseline: OrderItem[]): boolean {
  const baselineById = new Map(
    baseline.filter((item) => item.id).map((item) => [item.id!, item]),
  );
  const ids = line.unitIds?.length ? line.unitIds : line.id ? [line.id] : [];
  if (ids.length === 0) return !line.id;

  const savedUnits = ids
    .map((id) => baselineById.get(id))
    .filter((item): item is OrderItem => Boolean(item));
  if (savedUnits.length !== ids.length) return true;

  const [savedAgg] = aggregateOrderPanelItems(savedUnits);
  if (!savedAgg) return true;

  return aggregatedCompareKey(line) !== aggregatedCompareKey(savedAgg);
}

/** Kitchen tickets for qty increases and note updates on existing lines. */
export function kitchenPrintDelta(baseline: OrderItem[], draft: OrderItem[]): OrderItem[] {
  const draftAgg = aggregateOrderPanelItems(draft);
  const printItems: OrderItem[] = [];

  for (const line of draftAgg) {
    const ids = line.unitIds?.length ? line.unitIds : line.id ? [line.id] : [];
    if (ids.length === 0) continue;

    const prevUnits = baseline.filter((item) => item.id && ids.includes(item.id));
    const prevAgg = aggregateOrderPanelItems(prevUnits)[0];
    if (!prevAgg) continue;

    const qtyDelta = line.quantity - prevAgg.quantity;
    if (qtyDelta > 0) {
      if (isBillOnlyOrderLine(line) || isBillOnlyOrderLine(prevAgg)) continue;
      printItems.push({
        ...line,
        quantity: qtyDelta,
        skipPrint: false,
        hideOnKds: false,
      });
      continue;
    }

    const notesChanged =
      (line.notes ?? "") !== (prevAgg.notes ?? "") ||
      (line.notesTranslated ?? "") !== (prevAgg.notesTranslated ?? "");
    if (qtyDelta === 0 && notesChanged) {
      if (isBillOnlyOrderLine(line) || isBillOnlyOrderLine(prevAgg)) continue;
      printItems.push({
        ...line,
        quantity: 1,
        skipPrint: false,
        hideOnKds: false,
      });
    }
  }

  return printItems;
}
