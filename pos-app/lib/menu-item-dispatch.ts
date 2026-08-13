import type { MenuItem, OrderItem } from "@/lib/types";

/** Kitchen / bar routing vs bill-only (no send). */
export type MenuItemRoute = "kitchen" | "bar" | "none";

export function menuItemRouteFromItem(
  item: Pick<MenuItem, "billOnly" | "station">,
): MenuItemRoute {
  if (item.billOnly) return "none";
  return item.station === "bar" ? "bar" : "kitchen";
}

export function menuItemInputFromRoute(route: MenuItemRoute): Pick<MenuItem, "billOnly" | "station"> {
  if (route === "none") {
    return { billOnly: true, station: "kitchen" };
  }
  return { billOnly: false, station: route };
}

export function orderDispatchFromMenuItem(
  item: Pick<MenuItem, "billOnly"> | null | undefined,
): Pick<OrderItem, "skipPrint" | "hideOnKds"> {
  if (item?.billOnly) {
    return { skipPrint: true, hideOnKds: true };
  }
  return { skipPrint: false, hideOnKds: false };
}

/** Bill-only lines skip fulfillment — mark served so they do not block table flow. */
export function finalizeBillOnlyOrder(order: OrderItem): OrderItem {
  if (!order.skipPrint || !order.hideOnKds) return order;
  return {
    ...order,
    status: "served",
    kitchenStatus: "served",
  };
}

export function isBillOnlyOrderLine(
  line: Pick<OrderItem, "skipPrint" | "hideOnKds">,
): boolean {
  return Boolean(line.skipPrint && line.hideOnKds);
}
