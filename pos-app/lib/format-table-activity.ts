import type { TranslationKey } from "@/lib/i18n/translations";
import type { OrderLogEntry, TableActivityLogEntry } from "@/lib/types";

/** Unified row for timeline display (legacy order_logs + table_activity_logs). */
export interface ActivityTimelineEntry {
  id: string;
  action: string;
  staffName: string;
  createdAt: Date;
  itemName?: string;
  orderId?: string;
  meta?: Record<string, unknown>;
}

export function orderLogToTimeline(entry: OrderLogEntry, itemName?: string): ActivityTimelineEntry {
  return {
    id: entry.id,
    action: entry.action,
    staffName: entry.staffName,
    createdAt: entry.createdAt,
    itemName,
    orderId: entry.orderId,
  };
}

export function tableActivityToTimeline(entry: TableActivityLogEntry): ActivityTimelineEntry {
  return {
    id: entry.id,
    action: entry.action,
    staffName: entry.staffName,
    createdAt: entry.createdAt,
    itemName: entry.itemName,
    orderId: entry.orderItemId,
    meta: entry.meta,
  };
}

const PAYMENT_LABEL_KEYS: Record<string, TranslationKey> = {
  cash: "cash",
  card: "card",
};

export function formatActivityTimelineLine(
  entry: ActivityTimelineEntry,
  translate: (key: TranslationKey) => string,
): string {
  const by = `${translate("byStaff")} ${entry.staffName}`;
  const item = entry.itemName?.trim();

  switch (entry.action) {
    case "sent_to_kitchen":
      return item
        ? `${item} ${translate("logSentToKitchen")} ${by}`
        : `${translate("logSentToKitchen")} ${by}`;
    case "save_no_print":
      return item
        ? `${item} ${translate("logSavedNoPrint")} ${by}`
        : `${translate("logOrderSavedNoPrint")} ${by}`;
    case "add_note":
      return item
        ? `${item} ${translate("logAddNote")} ${by}`
        : `${translate("logAddNote")} ${by}`;
    case "checkout": {
      const method = String(entry.meta?.paymentMethod ?? "cash");
      const methodLabel = translate(PAYMENT_LABEL_KEYS[method] ?? "cash");
      return `${translate("logCheckout")} ${methodLabel} ${by}`;
    }
    case "cancel_item":
      return item
        ? `${item} ${translate("logCancelItem")} ${by}`
        : `${translate("logCancelItem")} ${by}`;
    default:
      if (entry.action.startsWith("cancelled:")) {
        return item
          ? `${item} ${translate("logCancelItem")} ${by}`
          : `${translate("cancel")} ${by}`;
      }
      if (item) {
        return `${item} · ${entry.action} ${by}`;
      }
      return `${entry.action} ${by}`;
  }
}
