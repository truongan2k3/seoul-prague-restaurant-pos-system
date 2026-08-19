import { resolveKitchenStatus } from "@/lib/auto-serve";
import type { OrderItem, RestaurantTable } from "@/lib/types";

/** Show kitchen prep timer until the item is marked ready (or served/cancelled). */
export function shouldShowItemKitchenTimer(
  item: Pick<OrderItem, "kitchenStatus" | "status" | "isCancelled" | "createdAt">,
): boolean {
  if (!item.createdAt || item.isCancelled) return false;
  return resolveKitchenStatus(item) === "pending";
}

export function itemKitchenTimerStart(item: OrderItem): Date | null {
  if (!shouldShowItemKitchenTimer(item)) return null;
  return new Date(item.createdAt!);
}

/** When the table was occupied — prefers `occupiedAt`, falls back to earliest order time. */
export function resolveTableOccupiedSince(
  table: Pick<RestaurantTable, "occupiedAt" | "orders" | "status">,
  orderItems: OrderItem[] = [],
): Date | null {
  if (table.status === "empty") return null;
  if (table.occupiedAt) return table.occupiedAt;

  const orders = orderItems.length > 0 ? orderItems : (table.orders ?? []);
  const earliest = orders
    .filter((item) => item.createdAt)
    .sort(
      (a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime(),
    )[0];

  return earliest?.createdAt ? new Date(earliest.createdAt) : null;
}
