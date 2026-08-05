"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { User } from "lucide-react";
import { CancelReasonModal } from "@/components/cancel-reason-modal";
import { NewOrderNotificationListener } from "@/components/new-order-notification-listener";
import { LanguageSelector } from "@/components/language-selector";
import { LiveClock } from "@/components/live-clock";
import { OrderItemChecklist } from "@/components/order-item-checklist";
import { useApp } from "@/contexts/app-context";
import { usePinGate } from "@/contexts/pin-gate-context";
import { useStationScreen } from "@/contexts/station-screen-context";
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
  markItemsPreparing,
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
  onMarkReady,
  onUndoReady,
  onCancelItem,
  busy,
  showCancel,
}: {
  ticket: TableTicket;
  menuItems: MenuItem[];
  language: ReturnType<typeof useStationScreen>["language"];
  translate: ReturnType<typeof useStationScreen>["translate"];
  onMarkReady: (tableId: string, itemId: string) => void;
  onUndoReady: (tableId: string, itemId: string) => void;
  onCancelItem?: (tableId: string, itemId: string) => void;
  busy: boolean;
  showCancel: boolean;
}) {
  const openCount = ticket.items.filter(
    (item) => normalizeOrderItemStatus(item.status) === "preparing",
  ).length;

  return (
    <article
      className={`flex h-full min-h-0 w-[min(100%,360px)] shrink-0 flex-col rounded-2xl border-4 bg-white p-4 shadow-xl sm:w-[340px] sm:p-5 dark:bg-gray-900 ${
        ticketHasOpenKitchenWork(ticket.items)
          ? "border-amber-500 ring-2 ring-amber-500/30"
          : "border-emerald-500 ring-2 ring-emerald-500/20 opacity-95"
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
          {openCount} {translate("preparing").toLowerCase()}
        </div>
      </header>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain sm:mt-4">
        <OrderItemChecklist
          items={ticket.items}
          menuItems={menuItems}
          language={language}
          translate={translate}
          variant="kitchen"
          interactive
          onMarkReady={(itemId) => {
            if (!busy) onMarkReady(ticket.table.id, itemId);
          }}
          onUndoReady={(itemId) => {
            if (!busy) onUndoReady(ticket.table.id, itemId);
          }}
          onCancelItem={
            showCancel && onCancelItem
              ? (itemId) => {
                  if (!busy) onCancelItem(ticket.table.id, itemId);
                }
              : undefined
          }
        />
      </div>
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
  const canCancel = canVoidOrderItems(currentStaffUser?.role);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [items, setItems] = useState<StationOrderItem[]>([]);
  const [busy, setBusy] = useState(false);
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

  const handleMarkItemReady = async (tableId: string, itemId: string) => {
    if (busy) return;
    setBusy(true);
    await markItemsReady([itemId], actor, tableId);
    setBusy(false);
    void reload();
  };

  const handleUndoItemReady = async (tableId: string, itemId: string) => {
    if (busy) return;
    setBusy(true);
    await markItemsPreparing([itemId], actor, tableId);
    setBusy(false);
    void reload();
  };

  const handleCancelItemRequest = (tableId: string, itemId: string) => {
    requestPin(() => setCancelTarget({ tableId, itemIds: [itemId] }));
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
    ? "flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-zinc-950 text-white"
    : "flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-slate-950 text-white";
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
          <LanguageSelector
            variant="flag-menu"
            tone="dark"
            language={language}
            onLanguageChange={setLanguage}
          />
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

      <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto overflow-y-hidden p-5 md:p-6">
        {tickets.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-lg font-medium text-zinc-500">
            {translate("noOrders")}
          </div>
        ) : (
          tickets.map((ticket) => (
            <TicketCard
              key={ticket.table.id}
              ticket={ticket}
              menuItems={menuItems}
              language={language}
              translate={translate}
              onMarkReady={(tableId, itemId) => void handleMarkItemReady(tableId, itemId)}
              onUndoReady={(tableId, itemId) => void handleUndoItemReady(tableId, itemId)}
              onCancelItem={handleCancelItemRequest}
              busy={busy}
              showCancel={canCancel}
            />
          ))
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
