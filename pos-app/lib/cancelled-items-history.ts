import { isCancelActivityAction } from "@/lib/order-activity";
import type { DateRange } from "@/lib/summary-analytics";
import type { OrderLogEntry, SaleRecord } from "@/lib/types";

/** One cancelled / qty-reduced line for History → Cancelled Items. */
export type CancelledItemRecord = {
  id: string;
  itemName: string;
  quantity: number;
  staffName: string;
  /** Exact time of Save that confirmed the removal — not order/table open time. */
  cancelledAt: Date;
  tableLabel: string;
  reason?: string;
  /** open = still on an unpaid table session; paid = snapshotted into a closed sale */
  source: "open" | "paid";
  saleId?: string;
  action: string;
};

function quantityFromMeta(meta?: Record<string, unknown>): number {
  const qty = Number(meta?.quantity ?? 1);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function reasonFromMeta(meta?: Record<string, unknown>): string | undefined {
  const reason = typeof meta?.reason === "string" ? meta.reason.trim() : "";
  return reason || undefined;
}

export function cancelledItemFromSaleEntry(
  sale: Pick<SaleRecord, "id" | "tableLabel">,
  entry: OrderLogEntry,
): CancelledItemRecord | null {
  if (!isCancelActivityAction(entry.action)) return null;
  return {
    id: `sale:${sale.id}:${entry.id}`,
    itemName: entry.itemName?.trim() || "Item",
    quantity: quantityFromMeta(entry.meta),
    staffName: entry.staffName?.trim() || "—",
    cancelledAt: entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt),
    tableLabel: sale.tableLabel,
    reason: reasonFromMeta(entry.meta),
    source: "paid",
    saleId: sale.id,
    action: entry.action,
  };
}

export function collectCancelledItemsFromSales(sales: SaleRecord[]): CancelledItemRecord[] {
  const rows: CancelledItemRecord[] = [];
  for (const sale of sales) {
    for (const entry of sale.activityLog ?? []) {
      const row = cancelledItemFromSaleEntry(sale, entry);
      if (row) rows.push(row);
    }
  }
  return rows;
}

export type OpenCancelLogRow = {
  id: string;
  tableLabel: string;
  itemName: string;
  action: string;
  staffName: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
};

export function cancelledItemFromOpenLog(row: OpenCancelLogRow): CancelledItemRecord | null {
  if (!isCancelActivityAction(row.action)) return null;
  return {
    id: `open:${row.id}`,
    itemName: row.itemName?.trim() || "Item",
    quantity: quantityFromMeta(row.meta),
    staffName: row.staffName?.trim() || "—",
    cancelledAt: row.createdAt,
    tableLabel: row.tableLabel || "—",
    reason: reasonFromMeta(row.meta),
    source: "open",
    action: row.action,
  };
}

export function collectCancelledItemsFromOpenLogs(
  logs: OpenCancelLogRow[],
): CancelledItemRecord[] {
  const rows: CancelledItemRecord[] = [];
  for (const log of logs) {
    const row = cancelledItemFromOpenLog(log);
    if (row) rows.push(row);
  }
  return rows;
}

export function filterCancelledItemsInRange(
  rows: CancelledItemRecord[],
  range: DateRange,
): CancelledItemRecord[] {
  return rows
    .filter((row) => {
      const t = row.cancelledAt.getTime();
      return t >= range.start.getTime() && t <= range.end.getTime();
    })
    .sort((a, b) => b.cancelledAt.getTime() - a.cancelledAt.getTime());
}

export function mergeCancelledItemSources(
  fromSales: CancelledItemRecord[],
  fromOpen: CancelledItemRecord[],
): CancelledItemRecord[] {
  return [...fromSales, ...fromOpen];
}

/** $0 voided sale used only to keep cancel logs after an empty-bill clear. */
export function isCancelOnlyAuditSale(sale: SaleRecord): boolean {
  return (
    Boolean(sale.deletedAt) &&
    sale.items.length === 0 &&
    Number(sale.grandTotal) === 0 &&
    (sale.activityLog ?? []).some((entry) => isCancelActivityAction(entry.action))
  );
}
