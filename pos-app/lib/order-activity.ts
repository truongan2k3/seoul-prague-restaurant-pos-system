import type { OrderLogEntry, PaymentMethod, SaleRecord } from "@/lib/types";
import { formatCzk } from "@/lib/currency";

export const CANCEL_ACTIVITY_ACTIONS = [
  "cancel_item",
  "qty_reduced",
  "removed_from_order",
] as const;

export const TIP_EDIT_ACTIVITY_ACTION = "tip_edited" as const;

export const HISTORY_ALERT_ACTIONS = [
  ...CANCEL_ACTIVITY_ACTIONS,
  TIP_EDIT_ACTIVITY_ACTION,
] as const;

export type CancelActivityAction = (typeof CANCEL_ACTIVITY_ACTIONS)[number];

export function isCancelActivityAction(action: string): boolean {
  return (CANCEL_ACTIVITY_ACTIONS as readonly string[]).includes(action);
}

export function isHistoryAlertAction(action: string): boolean {
  return (HISTORY_ALERT_ACTIONS as readonly string[]).includes(action);
}

export function saleHasCancelActivity(sale: Pick<SaleRecord, "activityLog">): boolean {
  return (sale.activityLog ?? []).some((entry) => isCancelActivityAction(entry.action));
}

export function saleHasHistoryAlert(sale: Pick<SaleRecord, "activityLog">): boolean {
  return (sale.activityLog ?? []).some((entry) => isHistoryAlertAction(entry.action));
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

export function formatTipEditActivityLine(entry: OrderLogEntry): string {
  const previousTip = Number(entry.meta?.previousTip ?? 0);
  const newTip = Number(entry.meta?.newTip ?? 0);
  const previousMethod =
    (entry.meta?.previousTipPaymentMethod as PaymentMethod | undefined) ?? "cash";
  const newMethod = (entry.meta?.newTipPaymentMethod as PaymentMethod | undefined) ?? previousMethod;

  const tipPart = `${formatCzk(previousTip)} → ${formatCzk(newTip)}`;
  if (previousMethod !== newMethod) {
    return `${tipPart} (${previousMethod} → ${newMethod})`;
  }
  return tipPart;
}

export function formatHistoryActivityLine(entry: OrderLogEntry): string {
  if (entry.action === TIP_EDIT_ACTIVITY_ACTION) {
    return formatTipEditActivityLine(entry);
  }
  return formatCancelActivityLine(entry);
}

export function historyActivityLogLabelKey(
  action: string,
): "logCancelItem" | "logTipEdited" {
  return action === TIP_EDIT_ACTIVITY_ACTION ? "logTipEdited" : "logCancelItem";
}
