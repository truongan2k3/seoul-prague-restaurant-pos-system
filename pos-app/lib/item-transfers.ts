import type { OrderItem, OrderLineModifiers } from "@/lib/types";

export type ItemTransferReason = "wrong_table" | "customer_moved" | "split_group" | "other";
export type TransferSelection = { id: string; quantity: number; expected: Record<string, unknown> };
export type TransferableItem = { id: string; name: string; price: number; quantity: number; notes: string | null; status: string; expected: Record<string, unknown> };
export type ItemTransferHistory = {
  id: string; source_table_id: string; destination_table_id: string; source_label: string; destination_label: string;
  actor_name: string; created_at: string; amount: number; reason: ItemTransferReason; note: string;
  event_kind: "TRANSFER_ORDER_ITEM" | "UNDO_ITEM_TRANSFER"; reversal_of: string | null; reversed?: boolean;
  items: { before: { id: string; name: string }; movedId: string; quantity: number }[];
};

/** Matches the existing INSERT notification pipeline; normal items retain normal dispatch. */
export function orderItemEventKind(item: Pick<OrderItem, "modifiers">): "NEW_ORDER_ITEM" | "TRANSFER_ORDER_ITEM" | "UNDO_ITEM_TRANSFER" {
  return item.modifiers?.itemTransfer?.event ?? "NEW_ORDER_ITEM";
}

export function itemTransferLabel(modifiers: OrderLineModifiers | undefined | null, language: string): string | null {
  const from = modifiers?.itemTransfer?.fromLabel;
  if (!from) return null;
  return `${language === "vi" ? "Chuyển từ" : language === "cs" ? "Přesunuto ze stolu" : language === "zh" ? "转自" : "Transferred from"} ${from}`;
}
