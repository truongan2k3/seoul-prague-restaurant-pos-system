import { normalizeOrderItemStatus } from "@/lib/order-status";
import type { OrderItem, OrderItemStatus, RestaurantTable } from "@/lib/types";

/** Kitchen KDS — cooking + finished items stay visible until ticket ages out. */
export const KDS_VISIBLE_STATUSES: OrderItemStatus[] = ["preparing", "ready"];

/** Floor active orders — billable until checkout clears the table. */
export const FLOOR_ACTIVE_STATUSES: OrderItemStatus[] = ["preparing", "ready", "served"];

export function filterItemsForBoard(
  items: OrderItem[],
  mode: "kitchen" | "floor",
): OrderItem[] {
  const allowed = mode === "kitchen" ? KDS_VISIBLE_STATUSES : FLOOR_ACTIVE_STATUSES;
  return items.filter((item) => allowed.includes(normalizeOrderItemStatus(item.status)));
}

export function ticketHasOpenKitchenWork(items: OrderItem[]): boolean {
  return items.some((item) => normalizeOrderItemStatus(item.status) === "preparing");
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
  return normalizeOrderItemStatus(item.status) === "ready";
}
