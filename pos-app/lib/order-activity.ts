import type { OrderLogEntry, SaleRecord } from "@/lib/types";

export const CANCEL_ACTIVITY_ACTIONS = [
  "cancel_item",
  "qty_reduced",
  "removed_from_order",
] as const;

export type CancelActivityAction = (typeof CANCEL_ACTIVITY_ACTIONS)[number];

export function isCancelActivityAction(action: string): boolean {
  return (CANCEL_ACTIVITY_ACTIONS as readonly string[]).includes(action);
}

export function saleHasCancelActivity(sale: Pick<SaleRecord, "activityLog">): boolean {
  return (sale.activityLog ?? []).some((entry) => isCancelActivityAction(entry.action));
}

export function formatCancelActivityLine(entry: OrderLogEntry): string {
  const qty = Number(entry.meta?.quantity ?? 1);
  const reason = typeof entry.meta?.reason === "string" ? entry.meta.reason : "";
  const status = typeof entry.meta?.previousStatus === "string" ? entry.meta.previousStatus : "";
  const name = entry.itemName?.trim() || "Item";
  const qtyLabel = qty > 1 ? `${qty}× ${name}` : name;
  const bits = [qtyLabel];
  if (status) bits.push(`(${status})`);
  if (reason) bits.push(`— ${reason}`);
  return bits.join(" ");
}
