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
import { fetchOrderLogsForTable } from "@/src/lib/order-log-actions";
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
  /** Bump after save/send so the panel refetches. */
  refreshKey?: number;
}

export function TableActivityLogPanel({
  tableId,
  since,
  orderItemIds = [],
  itemNameByOrderId = new Map(),
  snapshot,
  compact = false,
  defaultOpen = false,
  refreshKey = 0,
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
      fetchOrderLogsForTable(tableId, since),
    ]);

    const names = new Map(itemNameByOrderId);
    for (const [id, name] of orderRes.itemNames) {
      if (!names.has(id)) names.set(id, name);
    }
    for (const id of orderItemIds) {
      const label = itemNameByOrderId.get(id);
      if (label) names.set(id, label);
    }

    setEntries(mergeTimeline(tableRes.data, orderRes.data, names));
    setLoading(false);
  }, [snapshot, tableId, since, orderItemIds, itemNameByOrderId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load, refreshKey]);

  const panelBody = (
    <div className={compact ? "max-h-48 overflow-y-auto" : "max-h-64 overflow-y-auto"}>
      {loading && entries.length === 0 ? (
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
      {loading && entries.length > 0 ? (
        <p className="pb-2 text-[10px] text-gray-400">{translate("loading")}…</p>
      ) : null}
    </div>
  );

  if (compact) {
    return (
      <div className="border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800/60"
        >
          <History className="h-4 w-4 shrink-0" />
          {translate("viewActivityLog")}
        </button>
        {open ? <div className="px-4 pb-3">{panelBody}</div> : null}
      </div>
    );
  }

  return (
    <section>
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        <History className="h-4 w-4" />
        {translate("activityLog")}
      </h3>
      <div className="mt-2">{panelBody}</div>
    </section>
  );
}
