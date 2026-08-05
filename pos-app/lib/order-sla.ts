import { normalizeOrderItemStatus } from "@/lib/order-status";
import type { OrderItem } from "@/lib/types";

export const SLA_THRESHOLD_MS = 10 * 60 * 1000;

export function isSlaTrackedStatus(status: OrderItem["status"] | undefined): boolean {
  const normalized = normalizeOrderItemStatus(status);
  return normalized === "pending" || normalized === "preparing";
}

export function isItemSlaBreached(
  item: Pick<OrderItem, "status" | "createdAt">,
  nowMs: number = Date.now(),
): boolean {
  if (!isSlaTrackedStatus(item.status)) return false;
  if (!item.createdAt) return false;
  return nowMs - new Date(item.createdAt).getTime() >= SLA_THRESHOLD_MS;
}

export function tableIdsWithSlaBreach(
  orderItems: OrderItem[],
  nowMs: number = Date.now(),
): Set<string> {
  const breached = new Set<string>();
  for (const item of orderItems) {
    if (item.tableId && isItemSlaBreached(item, nowMs)) {
      breached.add(item.tableId);
    }
  }
  return breached;
}

export function isLineEditable(status: OrderItem["status"] | undefined): boolean {
  const normalized = normalizeOrderItemStatus(status);
  return normalized === "pending" || normalized === "held" || !status;
}

/** Manage-table screen: qty/delete available for all active bill lines, including served. */
export function isManageTableLineEditable(status: OrderItem["status"] | undefined): boolean {
  const normalized = normalizeOrderItemStatus(status);
  return (
    normalized === "pending" ||
    normalized === "held" ||
    normalized === "preparing" ||
    normalized === "ready" ||
    normalized === "served" ||
    !status
  );
}

export function isManageTablePriceEditable(_status: OrderItem["status"] | undefined): boolean {
  return true;
}
