import { normalizeOrderItemStatus } from "@/lib/order-status";
import {
  isCancelledKitchenItem,
  isKitchenBoardVisible,
  resolveKitchenStatus,
} from "@/lib/auto-serve";
import type { OrderItem, OrderItemStatus, RestaurantTable } from "@/lib/types";

/** Kitchen KDS — pending + ready stay visible; served is auto-hidden. */
export const KDS_VISIBLE_STATUSES: OrderItemStatus[] = ["preparing", "ready", "pending"];

/** Floor active orders — billable until checkout clears the table. */
export const FLOOR_ACTIVE_STATUSES: OrderItemStatus[] = ["preparing", "ready", "served", "pending"];

export function filterItemsForBoard(
  items: OrderItem[],
  mode: "kitchen" | "floor",
): OrderItem[] {
  if (mode === "kitchen") {
    return items.filter((item) => isKitchenBoardVisible(item));
  }
  return items.filter((item) => {
    if (isCancelledKitchenItem(item) || resolveKitchenStatus(item) === "archived") return false;
    return FLOOR_ACTIVE_STATUSES.includes(normalizeOrderItemStatus(item.status));
  });
}

export function ticketHasOpenKitchenWork(items: OrderItem[]): boolean {
  return items.some(
    (item) => !item.hideOnKds && resolveKitchenStatus(item) === "pending",
  );
}

/** Tables with open kitchen work first; fully ready tickets sink to the back. */
export function sortKitchenTickets<T extends { table: RestaurantTable; items: OrderItem[] }>(
  tickets: T[],
): T[] {
  return [...tickets].sort((a, b) => {
    const aOpen = ticketHasOpenKitchenWork(a.items);
    const bOpen = ticketHasOpenKitchenWork(b.items);
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    return (a.table.occupiedAt?.getTime() ?? 0) - (b.table.occupiedAt?.getTime() ?? 0);
  });
}

export function isItemReadyForKitchen(item: OrderItem): boolean {
  return resolveKitchenStatus(item) === "ready";
}
