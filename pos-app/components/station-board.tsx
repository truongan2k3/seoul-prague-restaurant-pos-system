"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { subscribePosSoftRefresh } from "@/lib/pos-refresh";
import { useSessionHealth } from "@/hooks/use-session-health";
import { Bell, User } from "lucide-react";
import { AnnouncementMarquee } from "@/components/announcement-marquee";
import { CancelReasonModal } from "@/components/cancel-reason-modal";
import { NewOrderNotificationListener } from "@/components/new-order-notification-listener";
import { LanguageSelector } from "@/components/language-selector";
import { HeaderClockWithStatus } from "@/components/connection-status-badge";
import { OrderItemChecklist } from "@/components/order-item-checklist";
import { useApp } from "@/contexts/app-context";
import { usePinGate } from "@/contexts/pin-gate-context";
import { useSettings } from "@/contexts/settings-context";
import { useStationScreen } from "@/contexts/station-screen-context";
import { usesKitchenScreen } from "@/lib/kitchen-fulfillment-mode";
import { filterItemsForBoard, sortKitchenTickets, ticketHasOpenKitchenWork } from "@/lib/order-board";
import { aggregateDisplayItems } from "@/lib/order-item-aggregate";
import {
  AUTO_SERVE_POLL_MS,
  isCancelledKitchenItem,
  resolveKitchenStatus,
} from "@/lib/auto-serve";
import { playCancelAlertSound } from "@/lib/notification-sound";
import { broadcastCallWaiter } from "@/lib/pos-notifications";
import { canVoidOrderItems } from "@/lib/staff-roles";
import { POS_EGRESS } from "@/lib/egress-config";
import type { MenuItem, OrderItem, RestaurantTable, Station } from "@/lib/types";
import {
  applyStationOrderItemRealtimeEvent,
  applyTableRealtimeEvent,
} from "@/lib/realtime-pos-sync";
import { subscribeToPostgresRowChanges } from "@/lib/realtime-subscribe";
import {
  fetchStationOrderItems,
  fetchTableSummaries,
  loadMenuItemsResolved,
  mapOrderItemRow,
  mapTablesResponse,
  subscribeToMenuChanges,
  type SupabaseOrderItemRow,
} from "@/src/lib/supabase-data";
import {
  acknowledgeCancelledItems,
  autoFirePendingItems,
  autoServeExpiredReadyItems,
  cancelOrderItems,
  markItemsPreparing,
  markItemsReady,
} from "@/src/lib/table-actions";

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
  checklistVariant,
  onMarkReady,
  onUndoReady,
  onCancelItem,
  onAcknowledgeCancel,
  busy,
  showCancel,
}: {
  ticket: TableTicket;
  menuItems: MenuItem[];
  language: ReturnType<typeof useStationScreen>["language"];
  translate: ReturnType<typeof useStationScreen>["translate"];
  checklistVariant: "kitchen" | "bar";
  onMarkReady: (tableId: string, itemIds: string[]) => void;
  onUndoReady: (tableId: string, itemIds: string[]) => void;
  onCancelItem?: (tableId: string, itemIds: string[]) => void;
  onAcknowledgeCancel?: (tableId: string, itemIds: string[]) => void;
  busy: boolean;
  showCancel: boolean;
}) {
  const openCount = ticket.items.filter(
    (item) => resolveKitchenStatus(item) === "pending",
  ).length;
  const hasCancelled = ticket.items.some((item) => isCancelledKitchenItem(item));

  return (
    <article
      className={`flex h-full min-h-0 w-[min(100%,360px)] shrink-0 flex-col rounded-2xl border-2 bg-[#121214] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.45)] sm:w-[340px] sm:p-5 ${
        hasCancelled
          ? "border-red-500 ring-2 ring-red-500/40"
          : ticketHasOpenKitchenWork(ticket.items)
            ? "border-amber-500/80 ring-2 ring-amber-500/25"
            : "border-emerald-500/70 ring-2 ring-emerald-500/20 opacity-95"
      }`}
    >
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 pb-3 sm:pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#C9A88B]">
            {translate("table")}
          </p>
          <p className="pos-serif text-3xl font-medium leading-none tracking-tight text-[#f5f2ef] sm:text-4xl">
            {ticket.table.label}
          </p>
        </div>
        <div className="rounded-xl bg-white/5 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-white/70">
          {openCount} {translate("preparing").toLowerCase()}
        </div>
      </header>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain sm:mt-4">
        <OrderItemChecklist
          items={ticket.items}
          menuItems={menuItems}
          language={language}
          translate={translate}
          variant={checklistVariant}
          interactive
          onMarkReady={(itemIds) => {
            if (!busy) onMarkReady(ticket.table.id, itemIds);
          }}
          onUndoReady={(itemIds) => {
            if (!busy) onUndoReady(ticket.table.id, itemIds);
          }}
          onCancelItem={
            showCancel && onCancelItem
              ? (itemIds) => {
                  if (!busy) onCancelItem(ticket.table.id, itemIds);
                }
              : undefined
          }
          onAcknowledgeCancel={
            onAcknowledgeCancel
              ? (itemIds) => {
                  if (!busy) onAcknowledgeCancel(ticket.table.id, itemIds);
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
  const { language, setLanguage, translate } = useStationScreen();
  const { settings } = useSettings();
  const screenEnabled = usesKitchenScreen(settings.kitchenFulfillmentMode);
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
  const [callingWaiter, setCallingWaiter] = useState(false);
  const seenCancelledIdsRef = useRef<Set<string>>(new Set());
  const cancelAlertReadyRef = useRef(false);

  const actor = currentStaffUser?.name?.trim() || (station === "kitchen" ? "Kitchen" : "Bar");
  const realtimeOpts = { debounceMs: POS_EGRESS.REALTIME_DEBOUNCE_MS };

  const reloadStationItems = useCallback(async () => {
    await autoFirePendingItems(actor, station);
    const itemsRes = await fetchStationOrderItems(station);
    setItems(
      ((itemsRes.data as SupabaseOrderItemRow[] | null) ?? []).map((row) => ({
        ...mapOrderItemRow(row),
        tableId: row.table_id,
        createdAt: row.created_at,
      })),
    );
  }, [actor, station]);

  const reloadTables = useCallback(async () => {
    const tablesRes = await fetchTableSummaries();
    if (!tablesRes.error) setTables(mapTablesResponse(tablesRes.data));
  }, []);

  const reloadMenu = useCallback(async () => {
    const menuRes = await loadMenuItemsResolved();
    if (!menuRes.error && menuRes.data) setMenuItems(menuRes.data);
  }, []);

  const reloadAll = useCallback(async () => {
    await Promise.all([reloadStationItems(), reloadTables(), reloadMenu()]);
  }, [reloadStationItems, reloadTables, reloadMenu]);

  useEffect(() => {
    void reloadAll();
    const unsubItems = subscribeToPostgresRowChanges(
      `station-items-row-sync-${station}`,
      { event: "*", schema: "public", table: "order_items" },
      (payload) => {
        setItems((prev) => applyStationOrderItemRealtimeEvent(prev, station, payload));
      },
    );
    const unsubTables = subscribeToPostgresRowChanges(
      `station-tables-row-sync-${station}`,
      { event: "*", schema: "public", table: "tables" },
      (payload) => {
        setTables((prev) => applyTableRealtimeEvent(prev, payload));
      },
    );
    const unsubMenu = subscribeToMenuChanges(() => void reloadMenu(), realtimeOpts);
    return () => {
      unsubItems();
      unsubTables();
      unsubMenu();
    };
  }, [reloadAll, reloadMenu, station]);

  useSessionHealth({
    onRefresh: () => void reloadAll(),
    isBusy: () => busy || cancelTarget != null,
  });

  useEffect(() => {
    return subscribePosSoftRefresh(() => void reloadAll());
  }, [reloadAll]);

  useEffect(() => {
    let cancelled = false;

    const runAutoServe = async () => {
      const { servedIds, error } = await autoServeExpiredReadyItems(station);
      if (cancelled) return;
      if (error) {
        console.warn("[AutoServe] Failed:", error.message);
        return;
      }
      if (servedIds.length > 0) void reloadStationItems();
    };

    void runAutoServe();
    const timer = window.setInterval(() => {
      void runAutoServe();
    }, AUTO_SERVE_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [station, reloadStationItems]);

  useEffect(() => {
    const cancelledIds = items
      .filter((item) => isCancelledKitchenItem(item) && item.id)
      .map((item) => item.id!);

    if (!cancelAlertReadyRef.current) {
      seenCancelledIdsRef.current = new Set(cancelledIds);
      cancelAlertReadyRef.current = true;
      return;
    }

    const fresh = cancelledIds.filter((id) => !seenCancelledIdsRef.current.has(id));
    if (fresh.length > 0) {
      playCancelAlertSound();
    }
    seenCancelledIdsRef.current = new Set(cancelledIds);
  }, [items]);

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

      const filtered = aggregateDisplayItems(
        filterItemsForBoard(tableItems, "kitchen"),
      ) as StationOrderItem[];
      if (filtered.length === 0) continue;

      result.push({
        table,
        items: filtered,
      });
    }

    return sortKitchenTickets(result);
  }, [items, tables]);

  const handleMarkItemReady = async (tableId: string, itemIds: string[]) => {
    if (busy || itemIds.length === 0) return;
    setBusy(true);
    await markItemsReady(itemIds, actor, tableId);
    setBusy(false);
    void reloadStationItems();
    void reloadTables();
  };

  const handleUndoItemReady = async (tableId: string, itemIds: string[]) => {
    if (busy || itemIds.length === 0) return;
    setBusy(true);
    await markItemsPreparing(itemIds, actor, tableId);
    setBusy(false);
    void reloadStationItems();
    void reloadTables();
  };

  const handleCancelItemRequest = (tableId: string, itemIds: string[]) => {
    if (itemIds.length === 0) return;
    requestPin(() => setCancelTarget({ tableId, itemIds }));
  };

  const handleCancelConfirm = async (reason: string) => {
    if (!cancelTarget || busy) return;
    setBusy(true);
    await cancelOrderItems(cancelTarget.itemIds, cancelTarget.tableId, reason, actor);
    setCancelTarget(null);
    setBusy(false);
    void reloadStationItems();
    void reloadTables();
  };

  const handleAcknowledgeCancel = async (tableId: string, itemIds: string[]) => {
    if (busy || itemIds.length === 0) return;
    setBusy(true);
    await acknowledgeCancelledItems(itemIds, actor);
    setBusy(false);
    void reloadStationItems();
    void reloadTables();
  };

  const handleCallWaiter = async () => {
    if (callingWaiter) return;
    setCallingWaiter(true);
    try {
      const focusTicket = tickets.find((ticket) =>
        ticket.items.some((item) => isCancelledKitchenItem(item) || resolveKitchenStatus(item) === "pending"),
      );
      await broadcastCallWaiter({
        tableId: focusTicket?.table.id,
        tableLabel: focusTicket?.table.label,
        station,
        message: translate("callWaiterToast"),
      });
    } catch (error) {
      console.warn("[CallWaiter] Broadcast failed:", error);
    } finally {
      setCallingWaiter(false);
    }
  };

  const shellClass =
    "flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#0B0B0C] text-[#f5f2ef]";
  const headerBorder = "border-white/10";
  const title = station === "kitchen" ? translate("kitchen") : translate("bar");
  const totalPreparing = items.filter((i) => resolveKitchenStatus(i) === "pending").length;

  if (!screenEnabled) {
    return (
      <div className={shellClass}>
        <header
          className={`flex shrink-0 items-center justify-between gap-4 border-b-2 px-6 py-5 ${headerBorder}`}
        >
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight">{title} KDS</h1>
            <p className="mt-1 text-sm font-medium text-zinc-400">
              {translate("settingsFulfillmentModePaper")}
            </p>
          </div>
          <LanguageSelector
            variant="flag-menu"
            tone="dark"
            language={language}
            onLanguageChange={setLanguage}
          />
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="max-w-md text-lg font-medium text-zinc-300">
            {translate("kitchenScreenDisabledPaperMode")}
          </p>
          <p className="max-w-md text-sm text-zinc-500">
            {translate("kitchenScreenDisabledPaperModeHint")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <NewOrderNotificationListener station={station} tables={tables} menuItems={menuItems} />
      <AnnouncementMarquee surface={station === "kitchen" ? "kds" : "bar"} tone="dark" />
      <header
        className={`flex shrink-0 flex-wrap items-center justify-between gap-4 border-b-2 px-6 py-5 ${headerBorder}`}
      >
        <div>
          <h1 className="pos-serif text-3xl font-medium tracking-tight text-[#f5f2ef]">
            {title} <span className="text-[#C9A88B]">KDS</span>
          </h1>
          <p className="mt-1 text-sm font-medium text-white/50">
            {tickets.length} {translate("table").toLowerCase()} · {totalPreparing}{" "}
            {translate("preparing").toLowerCase()}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleCallWaiter()}
            disabled={callingWaiter}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-black uppercase tracking-wide text-zinc-950 shadow-lg shadow-amber-500/30 transition hover:bg-amber-300 disabled:opacity-60"
          >
            <Bell className="h-5 w-5" />
            {callingWaiter ? translate("callingWaiter") : translate("callWaiter")}
          </button>
          <LanguageSelector
            variant="flag-menu"
            tone="dark"
            language={language}
            onLanguageChange={setLanguage}
          />
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#121214] px-3 py-2 text-sm text-[#f5f2ef]">
            <User className="h-4 w-4 text-[#C9A88B]" />
            <span>{currentStaffUser?.name ?? translate("staff")}</span>
          </div>
          <HeaderClockWithStatus clockClassName="text-lg font-bold tabular-nums text-white/80" />
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
              checklistVariant={variant}
              onMarkReady={(tableId, itemIds) => void handleMarkItemReady(tableId, itemIds)}
              onUndoReady={(tableId, itemIds) => void handleUndoItemReady(tableId, itemIds)}
              onCancelItem={handleCancelItemRequest}
              onAcknowledgeCancel={(tableId, itemIds) =>
                void handleAcknowledgeCancel(tableId, itemIds)
              }
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
