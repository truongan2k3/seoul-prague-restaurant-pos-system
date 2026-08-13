import type { AppSettings, OrderItem } from "@/lib/types";
import { isBillOnlyOrderLine } from "@/lib/menu-item-dispatch";

/** How sent orders reach the kitchen: KDS/bar screen, paper ticket, or both. */
export type KitchenFulfillmentMode = "both" | "screen" | "paper";

export const KITCHEN_FULFILLMENT_MODES: KitchenFulfillmentMode[] = ["both", "screen", "paper"];

export function parseKitchenFulfillmentMode(value: unknown): KitchenFulfillmentMode {
  if (value === "screen" || value === "paper" || value === "both") return value;
  return "both";
}

export function usesKitchenScreen(
  mode: KitchenFulfillmentMode = "both",
): boolean {
  return mode !== "paper";
}

/** Whether Send should print kitchen/bar tickets (respects mode + legacy toggle in "both"). */
export function shouldPrintKitchenOnSend(
  settings: Pick<AppSettings, "kitchenFulfillmentMode" | "kitchenPrintEnabled">,
): boolean {
  const mode = settings.kitchenFulfillmentMode ?? "both";
  if (mode === "screen") return false;
  if (mode === "paper") return true;
  return settings.kitchenPrintEnabled;
}

/** Paper-only: new lines skip KDS and are marked done immediately. */
export function applyFulfillmentModeToNewOrders(
  orders: OrderItem[],
  mode: KitchenFulfillmentMode = "both",
): OrderItem[] {
  if (mode !== "paper") return orders;
  const readyAt = new Date().toISOString();
  return orders.map((item) => {
    if (isBillOnlyOrderLine(item)) return item;
    return {
      ...item,
      status: "served",
      kitchenStatus: "served",
      hideOnKds: true,
      readyAt: item.readyAt ?? readyAt,
    };
  });
}
