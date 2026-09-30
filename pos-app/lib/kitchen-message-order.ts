import type { OrderItem } from "@/lib/types";

/** Detect staff "Table message" lines created for KDS acknowledgment. */
export function isKitchenMessageOrder(
  order: Pick<OrderItem, "modifiers"> | null | undefined,
): boolean {
  return Boolean(order?.modifiers?.kitchenMessage);
}

/** Build a kitchen-only, non-billable message line for KDS cards. */
export function buildKitchenMessageOrder(input: {
  message: string;
  messageZh: string;
}): OrderItem {
  const message = input.message.trim();
  const messageZh = input.messageZh.trim() || message;
  return {
    name: messageZh,
    price: 0,
    quantity: 1,
    notes: message,
    notesTranslated: messageZh,
    isPrintedNote: false,
    skipPrint: true,
    hideOnKds: false,
    station: "kitchen",
    status: "preparing",
    kitchenStatus: "pending",
    modifiers: { kitchenMessage: true },
  };
}
