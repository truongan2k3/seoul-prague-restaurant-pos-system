import { isBillOnlyOrderLine } from "@/lib/menu-item-dispatch";
import { resolveOriginalUnitPrice } from "@/lib/order-line-pricing";
import type { MenuItem, OrderItem } from "@/lib/types";

export type EditableLine = OrderItem & { lineId: string };

export function toEditableLines(
  orderItems: OrderItem[],
  fallbackOrders: OrderItem[],
  menuItems: MenuItem[],
): EditableLine[] {
  const source = orderItems.length > 0 ? orderItems : fallbackOrders;

  return source.map((item, index) => {
    const originalPrice = resolveOriginalUnitPrice(item, menuItems);
    return {
      ...item,
      originalPrice,
      price: item.price,
      lineId: item.id
        ? `${item.id}::${index}`
        : `line-${index}-${item.menuItemId ?? "x"}-${item.name}-${item.notes ?? ""}-${item.price}-${item.station ?? ""}`,
    };
  });
}

export function editableLinesToOrders(lines: EditableLine[]): OrderItem[] {
  return lines.filter((item) => item.quantity > 0).map(({ lineId: _lineId, ...item }) => item);
}

function orderItemCompareKey(item: OrderItem): string {
  return [
    item.id ?? "",
    item.menuItemId ?? "",
    item.name,
    item.price,
    item.quantity,
    item.notes ?? "",
    item.notesTranslated ?? "",
    JSON.stringify(item.modifiers ?? null),
  ].join("|");
}

/** True when current draft differs from last saved baseline. */
export function submittedOrdersDirty(current: OrderItem[], baseline: OrderItem[]): boolean {
  const currentKeys = current.map(orderItemCompareKey).sort();
  const baselineKeys = baseline.map(orderItemCompareKey).sort();
  if (currentKeys.length !== baselineKeys.length) return true;
  return currentKeys.some((key, index) => key !== baselineKeys[index]);
}

export function isSubmittedLineDirty(line: OrderItem, baseline: OrderItem[]): boolean {
  if (!line.id) return true;
  const saved = baseline.find((entry) => entry.id === line.id);
  if (!saved) return true;
  return orderItemCompareKey(line) !== orderItemCompareKey(saved);
}

/** Kitchen tickets for qty increases and note updates on existing lines. */
export function kitchenPrintDelta(baseline: OrderItem[], draft: OrderItem[]): OrderItem[] {
  const baselineById = new Map(
    baseline.filter((item) => item.id).map((item) => [item.id!, item]),
  );
  const printItems: OrderItem[] = [];

  for (const line of draft) {
    if (!line.id) continue;
    const prev = baselineById.get(line.id);
    if (!prev) continue;

    const qtyDelta = line.quantity - prev.quantity;
    if (qtyDelta > 0) {
      if (isBillOnlyOrderLine(line) || isBillOnlyOrderLine(prev)) continue;
      printItems.push({
        ...line,
        quantity: qtyDelta,
        skipPrint: false,
        hideOnKds: false,
      });
      continue;
    }

    const notesChanged =
      (line.notes ?? "") !== (prev.notes ?? "") ||
      (line.notesTranslated ?? "") !== (prev.notesTranslated ?? "");
    if (qtyDelta === 0 && notesChanged) {
      if (isBillOnlyOrderLine(line) || isBillOnlyOrderLine(prev)) continue;
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
