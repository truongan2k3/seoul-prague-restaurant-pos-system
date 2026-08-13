"use client";

import { useCallback, useEffect, useState } from "react";
import { History } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import {
  formatActivityTimelineLine,
  orderLogToTimeline,
  tableActivityToTimeline,
  type ActivityTimelineEntry,
} from "@/lib/format-table-activity";
import type { OrderLogEntry, TableActivityLogEntry } from "@/lib/types";
import { fetchOrderLogsForItems } from "@/src/lib/order-log-actions";
import { fetchTableActivityLogs } from "@/src/lib/table-activity-log-actions";

function mergeTimeline(
  tableLogs: TableActivityLogEntry[],
  orderLogs: OrderLogEntry[],
  itemNameByOrderId: Map<string, string>,
): ActivityTimelineEntry[] {
  const combined: ActivityTimelineEntry[] = [
    ...tableLogs.map(tableActivityToTimeline),
    ...orderLogs.map((entry) =>
      orderLogToTimeline(entry, itemNameByOrderId.get(entry.orderId)),
    ),
  ];
  combined.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const seen = new Set<string>();
  return combined.filter((entry) => {
    const key = `${entry.action}|${entry.itemName ?? ""}|${entry.staffName}|${entry.createdAt.getTime()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface TableActivityLogPanelProps {
  tableId: string;
  since?: Date;
  orderItemIds?: string[];
  itemNameByOrderId?: Map<string, string>;
  /** Pre-loaded snapshot (history / closed sale) */
  snapshot?: OrderLogEntry[];
  compact?: boolean;
  defaultOpen?: boolean;
}

export function TableActivityLogPanel({
  tableId,
  since,
  orderItemIds = [],
  itemNameByOrderId = new Map(),
  snapshot,
  compact = false,
  defaultOpen = false,
}: TableActivityLogPanelProps) {
  const { translate } = useApp();
  const [open, setOpen] = useState(defaultOpen || Boolean(snapshot?.length));
  const [entries, setEntries] = useState<ActivityTimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (snapshot && snapshot.length > 0) {
      setEntries(
        snapshot.map((entry) => ({
          id: entry.id,
          action: entry.action,
          staffName: entry.staffName,
          createdAt: entry.createdAt,
          itemName: entry.itemName ?? itemNameByOrderId.get(entry.orderId),
          orderId: entry.orderId,
          meta: entry.meta,
        })),
      );
      return;
    }

    setLoading(true);
    const [tableRes, orderRes] = await Promise.all([
      fetchTableActivityLogs(tableId, since),
      orderItemIds.length > 0
        ? fetchOrderLogsForItems(orderItemIds)
        : Promise.resolve({ data: [] as OrderLogEntry[], error: null }),
    ]);
    setEntries(mergeTimeline(tableRes.data, orderRes.data, itemNameByOrderId));
    setLoading(false);
  }, [snapshot, tableId, since, orderItemIds, itemNameByOrderId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const panelBody = (
    <div className={compact ? "max-h-48 overflow-y-auto" : "max-h-64 overflow-y-auto"}>
      {loading ? (
        <p className="py-3 text-xs text-gray-500 dark:text-gray-400">{translate("loading")}</p>
      ) : entries.length === 0 ? (
        <p className="py-3 text-xs text-gray-500 dark:text-gray-400">{translate("noActivityLog")}</p>
      ) : (
        <ol className="space-y-2 py-1">
          {entries.map((entry) => (
            <li key={entry.id} className="text-sm leading-snug text-gray-800 dark:text-gray-200">
              <span className="mr-2 tabular-nums text-xs text-gray-400">
                {entry.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              {formatActivityTimelineLine(entry, translate)}
            </li>
          ))}
        </ol>
      )}
    </div>
  );

  if (compact) {
    return (
      <div className="border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800/50"
        >
          <History className="h-3.5 w-3.5" />
          {translate("viewActivityLog")}
          <span className="ml-auto text-[10px] font-normal normal-case text-gray-400">
            {entries.length > 0 ? entries.length : ""}
          </span>
        </button>
        {open ? <div className="px-3 pb-3">{panelBody}</div> : null}
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {translate("activityLog")}
      </h3>
      <div className="mt-3">{panelBody}</div>
    </section>
  );
}
