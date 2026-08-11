"use client";

import { useMemo, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { CancelReasonModal } from "@/components/cancel-reason-modal";
import { LiveClock } from "@/components/live-clock";
import { NotificationBell } from "@/components/notification-bell";
import { OrderItemChecklist, TicketActionBar } from "@/components/order-item-checklist";
import { useApp } from "@/contexts/app-context";
import { usePinGate } from "@/contexts/pin-gate-context";
import { useNotifications } from "@/contexts/notification-context";
import { filterItemsForBoard } from "@/lib/order-board";
import { aggregateDisplayItems } from "@/lib/order-item-aggregate";
import { resolveActionItemIds, resolveSelectedItemIds } from "@/lib/order-item-selection";
import { normalizeOrderItemStatus } from "@/lib/order-status";
import { isTablePaidInProgress } from "@/lib/table-payment";
import { canVoidOrderItems } from "@/lib/staff-roles";
import { formatPrice } from "@/lib/i18n/translations";
import type { MenuItem, OrderItem, RestaurantTable } from "@/lib/types";
import {
  cancelOrderItems,
  markItemsLate,
} from "@/src/lib/table-actions";

function OrderCard({
  table,
  items,
  total,
  translate,
  menuItems,
  language,
  selectedIds,
  lateIds,
  onToggle,
  onToggleAll,
  onLate,
  onCancel,
  onManage,
  busy,
  canCancel,
  showDelay,
}: {
  table: RestaurantTable;
  items: OrderItem[];
  total: number;
  translate: ReturnType<typeof useApp>["translate"];
  menuItems: MenuItem[];
  language: ReturnType<typeof useApp>["language"];
  selectedIds: Set<string>;
  lateIds: Set<string>;
  onToggle: (itemId: string) => void;
  onToggleAll: () => void;
  onLate: () => void;
  onCancel: () => void;
  onManage: () => void;
  busy: boolean;
  canCancel: boolean;
  showDelay: boolean;
}) {
  const isReady = table.status === "ready";
  const isPaidInProgress = isTablePaidInProgress(table);

  return (
    <article
      className={`mb-4 flex break-inside-avoid flex-col rounded-xl border p-4 shadow-sm ${
        isPaidInProgress
          ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/40"
          : isReady
            ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/30"
            : "border-orange-200 bg-white dark:border-orange-900 dark:bg-gray-900"
      }`}
    >
      <button
        type="button"
        onClick={onManage}
        className="flex shrink-0 items-start justify-between text-left transition-opacity hover:opacity-90"
      >
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {translate("table")}
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{table.label}</p>
        </div>
        <div className="text-right">
          {isPaidInProgress ? (
            <p className="inline-flex rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white">
              {translate("paidBadge")}
            </p>
          ) : (
            <p
              className={`text-xs font-medium ${
                isReady
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-orange-600 dark:text-orange-400"
              }`}
            >
              {translate(isReady ? "ready" : "waiting")}
            </p>
          )}
          <p className="mt-2 inline-flex items-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white dark:bg-gray-100 dark:text-gray-900">
            <ShoppingBag className="h-3.5 w-3.5" />
            {translate("manageTable")}
          </p>
        </div>
      </button>

      <div className="mt-3 min-h-0 flex-1 border-t border-gray-100 pt-3 dark:border-gray-800">
        <OrderItemChecklist
          items={items}
          menuItems={menuItems}
          language={language}
          translate={translate}
          selectedIds={selectedIds}
          lateIds={lateIds}
          onToggle={onToggle}
          onToggleAll={onToggleAll}
          variant="floor"
          dense
        />
      </div>

      <footer className="mt-3 space-y-3 border-t border-gray-200 pt-3 dark:border-gray-800">
        <TicketActionBar
          translate={translate}
          disabled={busy || items.length === 0}
          onDone={() => undefined}
          onLate={onLate}
          onCancel={onCancel}
          showCancel={canCancel}
          showMarkServed={false}
          showDelay={showDelay}
          variant="floor"
        />
        <div className="flex items-center justify-between text-sm font-bold text-gray-900 dark:text-gray-100">
          <span>{translate("total")}</span>
          <span className="text-base tabular-nums">{formatPrice(total)}</span>
        </div>
      </footer>
    </article>
  );
}

export function OrderView({
  tables,
  orderItems,
  menuItems,
  onRefresh,
  onOpenTable,
  actionError,
}: {
  tables: RestaurantTable[];
  orderItems: OrderItem[];
  menuItems: MenuItem[];
  onRefresh?: () => void;
  onOpenTable: (tableId: string) => void;
  actionError?: string | null;
}) {
  const { translate, currentStaffUser, language } = useApp();
  const { requestPin } = usePinGate();
  const { pushToast } = useNotifications();
  const [busy, setBusy] = useState(false);
  const [selectedByTable, setSelectedByTable] = useState<Record<string, Set<string>>>({});
  const [lateIds, setLateIds] = useState<Set<string>>(new Set());
  const [cancelTarget, setCancelTarget] = useState<{
    tableId: string;
    itemIds: string[];
  } | null>(null);

  const actor = currentStaffUser?.name ?? "Staff";
  const canCancel = canVoidOrderItems(currentStaffUser?.role);

  const activeTables = useMemo(() => {
    const tableIdsWithWork = new Set(orderItems.map((item) => item.tableId).filter(Boolean));

    return tables
      .filter((t) => t.status !== "empty" && tableIdsWithWork.has(t.id))
      .sort((a, b) => (a.occupiedAt?.getTime() ?? 0) - (b.occupiedAt?.getTime() ?? 0));
  }, [tables, orderItems]);

  const getSelectedForTable = (tableId: string) => selectedByTable[tableId] ?? new Set<string>();

  const resolveTargetIds = (tableId: string, tableItems: OrderItem[]) =>
    resolveSelectedItemIds(tableItems, getSelectedForTable(tableId));

  const toggleItem = (tableId: string, itemId: string) => {
    setSelectedByTable((prev) => {
      const current = new Set(prev[tableId] ?? []);
      if (current.has(itemId)) current.delete(itemId);
      else current.add(itemId);
      return { ...prev, [tableId]: current };
    });
  };

  const toggleAll = (tableId: string, tableItems: OrderItem[]) => {
    const ids = tableItems.map((item) => item.id).filter((id): id is string => Boolean(id));
    setSelectedByTable((prev) => {
      const current = prev[tableId] ?? new Set<string>();
      const allSelected = ids.length > 0 && ids.every((id) => current.has(id));
      return { ...prev, [tableId]: allSelected ? new Set<string>() : new Set(ids) };
    });
  };

  const handleLate = async (tableId: string, tableItems: OrderItem[]) => {
    const selected = getSelectedForTable(tableId);
    const itemIds = resolveActionItemIds(
      tableItems,
      selected,
      (item) => normalizeOrderItemStatus(item.status) === "preparing",
    );
    if (itemIds.length === 0 || busy) return;
    setBusy(true);
    await markItemsLate(itemIds, actor);
    setLateIds((prev) => new Set([...prev, ...itemIds]));
    setBusy(false);
  };

  const handleCancelRequest = (tableId: string, tableItems: OrderItem[]) => {
    const itemIds = resolveTargetIds(tableId, tableItems);
    if (itemIds.length === 0) {
      pushToast({ message: translate("selectItemsToCancel") });
      return;
    }

    requestPin(() => setCancelTarget({ tableId, itemIds }));
  };

  const handleCancelConfirm = async (reason: string) => {
    if (!cancelTarget || busy) return;
    setBusy(true);
    await cancelOrderItems(cancelTarget.itemIds, cancelTarget.tableId, reason, actor);
    setSelectedByTable((prev) => ({ ...prev, [cancelTarget.tableId]: new Set() }));
    setCancelTarget(null);
    setBusy(false);
    onRefresh?.();
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {translate("order")}
          </h1>
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {activeTables.length} open
          </span>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <LiveClock />
        </div>
      </header>

      {actionError && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {actionError}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {activeTables.length === 0 ? (
          <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            {translate("noOrders")}
          </div>
        ) : (
          <div className="mx-auto max-w-[1600px] columns-1 gap-4 md:columns-2 lg:columns-3 xl:columns-4">
            {activeTables.map((table) => {
              const itemsForTable = aggregateDisplayItems(
                filterItemsForBoard(
                  orderItems.filter((item) => item.tableId === table.id),
                  "floor",
                ),
              );
              const total = itemsForTable.reduce((s, i) => s + i.price * i.quantity, 0);
              const showDelay = itemsForTable.some(
                (item) => normalizeOrderItemStatus(item.status) === "preparing",
              );

              return (
                <OrderCard
                  key={table.id}
                  table={table}
                  items={itemsForTable}
                  total={total}
                  translate={translate}
                  menuItems={menuItems}
                  language={language}
                  selectedIds={getSelectedForTable(table.id)}
                  lateIds={lateIds}
                  onToggle={(itemId) => toggleItem(table.id, itemId)}
                  onToggleAll={() => toggleAll(table.id, itemsForTable)}
                  onLate={() => void handleLate(table.id, itemsForTable)}
                  onCancel={() => handleCancelRequest(table.id, itemsForTable)}
                  onManage={() => onOpenTable(table.id)}
                  busy={busy}
                  canCancel={canCancel}
                  showDelay={showDelay}
                />
              );
            })}
          </div>
        )}
      </div>

      <CancelReasonModal
        open={cancelTarget !== null}
        itemCount={cancelTarget?.itemIds.length ?? 0}
        translate={translate}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancelConfirm}
        isSaving={busy}
      />
    </div>
  );
}
