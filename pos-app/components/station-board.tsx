"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { User } from "lucide-react";
import { CancelReasonModal } from "@/components/cancel-reason-modal";
import { NewOrderNotificationListener } from "@/components/new-order-notification-listener";
import { LanguageSelector } from "@/components/language-selector";
import { LiveClock } from "@/components/live-clock";
import { OrderItemChecklist, TicketActionBar } from "@/components/order-item-checklist";
import { useApp } from "@/contexts/app-context";
import { usePinGate } from "@/contexts/pin-gate-context";
import { useNotifications } from "@/contexts/notification-context";
import { useStationScreen } from "@/contexts/station-screen-context";
import { resolveSelectedItemIds } from "@/lib/order-item-selection";
import { filterItemsForBoard, sortKitchenTickets, ticketHasOpenKitchenWork } from "@/lib/order-board";
import { normalizeOrderItemStatus, STATION_BOARD_STATUSES } from "@/lib/order-status";
import { canVoidOrderItems } from "@/lib/staff-roles";
import type { MenuItem, OrderItem, RestaurantTable, Station } from "@/lib/types";
import {
  fetchMenuItems,
  fetchTables,
  mapMenuItemsResponse,
  mapOrderItemRow,
  mapTablesResponse,
  subscribeToOrderItemChanges,
  subscribeToTableChanges,
  type SupabaseOrderItemRow,
} from "@/src/lib/supabase-data";
import {
  autoFirePendingItems,
  cancelOrderItems,
  markItemsLate,
  markItemsReady,
} from "@/src/lib/table-actions";
import { supabase } from "@/src/lib/supabase";

type StationOrderItem = OrderItem & {
  tableId: string;
  createdAt?: string;
};

interface TableTicket {
  table: RestaurantTable;
  items: StationOrderItem[];
}

function TicketCard({
  ticket,
  menuItems,
  language,
  translate,
  selectedIds,
  lateIds,
  onToggle,
  onToggleAll,
  onDone,
  onLate,
  onCancel,
  busy,
  showCancel,
}: {
  ticket: TableTicket;
  menuItems: MenuItem[];
  language: ReturnType<typeof useStationScreen>["language"];
  translate: ReturnType<typeof useStationScreen>["translate"];
  selectedIds: Set<string>;
  lateIds: Set<string>;
  onToggle: (tableId: string, itemId: string) => void;
  onToggleAll: (tableId: string, items: StationOrderItem[]) => void;
  onDone: (tableId: string, items: StationOrderItem[]) => void;
  onLate: (tableId: string, items: StationOrderItem[]) => void;
  onCancel: (tableId: string, items: StationOrderItem[]) => void;
  busy: boolean;
  showCancel: boolean;
}) {
  const hasLate = ticket.items.some((item) => item.id && lateIds.has(item.id));

  return (
    <article
      className={`flex h-full min-h-[360px] max-h-[70vh] flex-col rounded-2xl border-4 bg-white p-4 shadow-xl sm:p-5 dark:bg-gray-900 ${
        hasLate
          ? "border-red-500 ring-2 ring-red-500/30"
          : ticketHasOpenKitchenWork(ticket.items)
            ? "border-amber-500 ring-2 ring-amber-500/30"
            : "border-emerald-500 ring-2 ring-emerald-500/20 opacity-90"
      }`}
    >
      <header className="flex shrink-0 items-start justify-between gap-4 border-b-2 border-gray-200 pb-3 dark:border-gray-700 sm:pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
            {translate("table")}
          </p>
          <p className="text-3xl font-black leading-none tracking-tight text-gray-950 sm:text-4xl dark:text-gray-100">
            {ticket.table.label}
          </p>
        </div>
        <div className="rounded-xl bg-gray-100 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          {ticket.items.length} {translate("preparing").toLowerCase()}
        </div>
      </header>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto sm:mt-4">
        <div className="max-h-60 overflow-y-auto pr-1">
          <OrderItemChecklist
          items={ticket.items}
          menuItems={menuItems}
          language={language}
          translate={translate}
          selectedIds={selectedIds}
          lateIds={lateIds}
          onToggle={(itemId) => onToggle(ticket.table.id, itemId)}
          onToggleAll={() => onToggleAll(ticket.table.id, ticket.items)}
          variant="kitchen"
        />
        </div>
      </div>

      <footer className="mt-3 shrink-0 border-t-2 border-gray-100 pt-3 dark:border-gray-800 sm:mt-4 sm:pt-4">
        <TicketActionBar
          translate={translate}
          disabled={busy || ticket.items.length === 0}
          onDone={() => onDone(ticket.table.id, ticket.items)}
          onLate={() => onLate(ticket.table.id, ticket.items)}
          onCancel={() => onCancel(ticket.table.id, ticket.items)}
          showCancel={showCancel}
          variant="kitchen"
        />
      </footer>
    </article>
  );
}

interface StationBoardProps {
  station: Station;
  variant?: "kitchen" | "bar";
}

export function StationBoard({ station, variant = station }: StationBoardProps) {
  const { language, staffName, setStaffName, setLanguage, translate } = useStationScreen();
  const { currentStaffUser } = useApp();
  const { requestPin } = usePinGate();
  const { pushToast } = useNotifications();
  const canCancel = canVoidOrderItems(currentStaffUser?.role);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [items, setItems] = useState<StationOrderItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [selectedByTable, setSelectedByTable] = useState<Record<string, Set<string>>>({});
  const [lateIds, setLateIds] = useState<Set<string>>(new Set());
  const [cancelTarget, setCancelTarget] = useState<{
    tableId: string;
    itemIds: string[];
  } | null>(null);

  const actor = staffName.trim() || (station === "kitchen" ? "Kitchen" : "Bar");

  const reload = useCallback(async () => {
    await autoFirePendingItems(actor, station);

    const [tablesRes, itemsRes, menuRes] = await Promise.all([
      fetchTables(),
      supabase
        .from("order_items")
        .select("*")
        .eq("station", station)
        .in("status", STATION_BOARD_STATUSES)
        .order("created_at"),
      fetchMenuItems(),
    ]);

    if (!tablesRes.error) setTables(mapTablesResponse(tablesRes.data));
    if (!menuRes.error) setMenuItems(mapMenuItemsResponse(menuRes.data));
    setItems(
      ((itemsRes.data as SupabaseOrderItemRow[] | null) ?? []).map((row) => ({
        ...mapOrderItemRow(row),
        tableId: row.table_id,
        createdAt: row.created_at,
      })),
    );
  }, [actor, station]);

  useEffect(() => {
    void reload();
    const unsubItems = subscribeToOrderItemChanges(() => void reload());
    const unsubTables = subscribeToTableChanges(() => void reload());
    return () => {
      unsubItems();
      unsubTables();
    };
  }, [reload]);

  const tickets = useMemo(() => {
    const tableMap = new Map(tables.map((t) => [t.id, t]));
    const grouped = new Map<string, StationOrderItem[]>();

    for (const item of items) {
      const list = grouped.get(item.tableId) ?? [];
      list.push(item);
      grouped.set(item.tableId, list);
    }

    const result: TableTicket[] = [];

    for (const [tableId, tableItems] of grouped) {
      const table = tableMap.get(tableId);
      if (!table || table.status === "empty") continue;

      result.push({
        table,
        items: filterItemsForBoard(tableItems, "kitchen") as StationOrderItem[],
      });
    }

    return sortKitchenTickets(result);
  }, [items, tables]);

  const getSelectedForTable = (tableId: string) => selectedByTable[tableId] ?? new Set<string>();

  const resolveTargetIds = (tableId: string, tableItems: StationOrderItem[]) =>
    resolveSelectedItemIds(tableItems, getSelectedForTable(tableId));

  const toggleItem = (tableId: string, itemId: string) => {
    setSelectedByTable((prev) => {
      const current = new Set(prev[tableId] ?? []);
      if (current.has(itemId)) current.delete(itemId);
      else current.add(itemId);
      return { ...prev, [tableId]: current };
    });
  };

  const toggleAll = (tableId: string, tableItems: StationOrderItem[]) => {
    const ids = tableItems.map((item) => item.id).filter((id): id is string => Boolean(id));
    setSelectedByTable((prev) => {
      const current = prev[tableId] ?? new Set<string>();
      const allSelected = ids.length > 0 && ids.every((id) => current.has(id));
      return { ...prev, [tableId]: allSelected ? new Set<string>() : new Set(ids) };
    });
  };

  const handleDone = async (tableId: string, tableItems: StationOrderItem[]) => {
    const itemIds = resolveTargetIds(tableId, tableItems).filter((id) => {
      const item = tableItems.find((row) => row.id === id);
      return item && normalizeOrderItemStatus(item.status) === "preparing";
    });
    if (itemIds.length === 0 || busy) return;
    setBusy(true);
    await markItemsReady(itemIds, actor, tableId);
    setSelectedByTable((prev) => ({ ...prev, [tableId]: new Set() }));
    setBusy(false);
    void reload();
  };

  const handleLate = async (tableId: string, tableItems: StationOrderItem[]) => {
    const itemIds = resolveTargetIds(tableId, tableItems);
    if (itemIds.length === 0) {
      pushToast({ message: translate("selectItemsToCancel") });
      return;
    }
    if (busy) return;
    setBusy(true);
    await markItemsLate(itemIds, actor);
    setLateIds((prev) => new Set([...prev, ...itemIds]));
    setBusy(false);
  };

  const handleCancelRequest = (tableId: string, tableItems: StationOrderItem[]) => {
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
    setCancelTarget(null);
    setBusy(false);
    void reload();
  };

  const isKitchen = variant === "kitchen";
  const shellClass = isKitchen
    ? "flex h-screen min-h-0 flex-col bg-zinc-950 text-white"
    : "flex h-screen min-h-0 flex-col bg-slate-950 text-white";
  const headerBorder = isKitchen ? "border-zinc-700" : "border-slate-700";
  const title = station === "kitchen" ? translate("kitchen") : translate("bar");
  const totalPreparing = items.filter(
    (i) => normalizeOrderItemStatus(i.status) === "preparing",
  ).length;

  return (
    <div className={shellClass}>
      <NewOrderNotificationListener station={station} tables={tables} menuItems={menuItems} />
      <header
        className={`flex shrink-0 flex-wrap items-center justify-between gap-4 border-b-2 px-6 py-5 ${headerBorder}`}
      >
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight">{title} KDS</h1>
          <p className="mt-1 text-sm font-medium text-zinc-400">
            {tickets.length} {translate("table").toLowerCase()} · {totalPreparing}{" "}
            {translate("preparing").toLowerCase()}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="w-44">
            <LanguageSelector
              variant="dropdown"
              language={language}
              onLanguageChange={setLanguage}
              className="border-zinc-600 bg-zinc-900 text-zinc-100"
            />
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2">
            <User className="h-4 w-4 text-zinc-400" />
            <input
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              placeholder="Staff name"
              className="w-32 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
            />
          </label>
          <LiveClock className="text-lg font-bold tabular-nums text-zinc-200" />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-6">
        {tickets.length === 0 ? (
          <div className="flex h-full min-h-[320px] items-center justify-center text-lg font-medium text-zinc-500">
            {translate("noOrders")}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tickets.map((ticket) => (
              <TicketCard
                key={ticket.table.id}
                ticket={ticket}
                menuItems={menuItems}
                language={language}
                translate={translate}
                selectedIds={getSelectedForTable(ticket.table.id)}
                lateIds={lateIds}
                onToggle={toggleItem}
                onToggleAll={toggleAll}
                onDone={(tableId, tableItems) => void handleDone(tableId, tableItems)}
                onLate={(tableId, tableItems) => void handleLate(tableId, tableItems)}
                onCancel={handleCancelRequest}
                busy={busy}
                showCancel={canCancel}
              />
            ))}
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
