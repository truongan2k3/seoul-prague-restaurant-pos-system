import type { RestaurantTable } from "@/lib/types";

/** Paid early / takeaway while kitchen is still working. */
export function isTablePaidInProgress(table: Pick<RestaurantTable, "paymentStatus" | "fulfillmentStatus">): boolean {
  return table.paymentStatus === "paid" && table.fulfillmentStatus !== "completed";
}

export function isTableFullySettled(table: Pick<RestaurantTable, "paymentStatus" | "fulfillmentStatus">): boolean {
  return table.paymentStatus === "paid" && table.fulfillmentStatus === "completed";
}
