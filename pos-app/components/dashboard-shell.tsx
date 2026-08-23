"use client";

import { useCallback, useEffect, useState } from "react";
import { MapView } from "@/components/map-view";
import { OrderView } from "@/components/order-view";
import { HistoryView } from "@/components/history-view";
import { ReservationsView } from "@/components/reservations-view";
import { SummaryView } from "@/components/summary-view";
import { StorageView } from "@/components/storage-view";
import { StaffView } from "@/components/staff-view";
import { SettingsView } from "@/components/settings-view";
import { DynamicQrServicesView } from "@/components/dynamic-qr-services-view";
import { ReadyNotificationListener } from "@/components/ready-notification-listener";
import { MainNewOrderNotificationListener } from "@/components/main-new-order-notification-listener";
import { CallWaiterListener } from "@/components/call-waiter-listener";
import { Sidebar } from "@/components/sidebar";
import { AnnouncementMarquee } from "@/components/announcement-marquee";
import { ChangelogPopupGate } from "@/components/changelog-popup-gate";
import { POS_EGRESS } from "@/lib/egress-config";
import { subscribePosSoftRefresh } from "@/lib/pos-refresh";
import { useTableOrderWorkflow } from "@/hooks/use-table-order-workflow";
import { useSessionHealth } from "@/hooks/use-session-health";
import { useApp } from "@/contexts/app-context";
import { AUTO_SERVE_POLL_MS } from "@/lib/auto-serve";
import { canAccessNavTabForMember, firstAccessibleNavTab } from "@/lib/staff-roles";
import {
  fetchActiveOrderItems,
  fetchCategories,
  fetchInventory,
  fetchSales,
  fetchTableSummaries,
  loadMenuItemsResolved,
  mapCategoriesResponse,
  mapInventoryResponse,
  mapOrderItemRow,
  mapSalesResponse,
  mapTablesResponse,
  subscribeToCategoryChanges,
  subscribeToInventoryChanges,
  subscribeToMenuChanges,
  type SupabaseOrderItemRow,
} from "@/src/lib/supabase-data";
import { applyOrderItemRealtimeEvent, applyTableRealtimeEvent } from "@/lib/realtime-pos-sync";
import { subscribeToPostgresRowChanges } from "@/lib/realtime-subscribe";
import { autoServeExpiredReadyItems } from "@/src/lib/table-actions";
import type { InventoryItem, MenuCategoryRecord, MenuItem, RestaurantTable, SaleRecord, OrderItem, NavId } from "@/lib/types";

function LoadingShell() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100" />
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">Loading POS...</p>
      </div>
    </div>
  );
}

function salesSince(days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);
  return since;
}

export function DashboardShell() {
  const { currentStaffUser, refreshStaffList } = useApp();
  const [activeTab, setActiveTab] = useState<NavId>("map");
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategoryRecord[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [salesLoaded, setSalesLoaded] = useState(false);
  const [inventoryLoaded, setInventoryLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const realtimeOpts = { debounceMs: POS_EGRESS.REALTIME_DEBOUNCE_MS };

  const reloadTables = useCallback(async () => {
    const { data, error: err } = await fetchTableSummaries();
    if (!err) setTables(mapTablesResponse(data));
  }, []);

  const reloadMenu = useCallback(async () => {
    const { data, error: err } = await loadMenuItemsResolved();
    if (!err && data) setMenuItems(data);
  }, []);

  const reloadCategories = useCallback(async () => {
    const { data, error: err } = await fetchCategories();
    if (!err) setCategories(mapCategoriesResponse(data));
  }, []);

  const reloadOrderItems = useCallback(async () => {
    const { data, error: err } = await fetchActiveOrderItems();
    if (!err) {
      setOrderItems((data as SupabaseOrderItemRow[] | null)?.map(mapOrderItemRow) ?? []);
    }
  }, []);

  const reloadSales = useCallback(async () => {
    const { data, error: err } = await fetchSales(salesSince(POS_EGRESS.SUMMARY_SALES_DAYS));
    if (!err) {
      setSales(mapSalesResponse(data));
      setSalesLoaded(true);
    }
  }, []);

  const reloadInventory = useCallback(async () => {
    const { data, error: err } = await fetchInventory();
    if (!err) {
      setInventory(mapInventoryResponse(data));
      setInventoryLoaded(true);
    }
  }, []);

  const refreshFloorData = useCallback(() => {
    void reloadTables();
    void reloadOrderItems();
  }, [reloadTables, reloadOrderItems]);

  const refreshPosData = useCallback(() => {
    refreshFloorData();
    void reloadMenu();
    void reloadCategories();
  }, [refreshFloorData, reloadMenu, reloadCategories]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      const [t, m, c, o] = await Promise.all([
        fetchTableSummaries(),
        loadMenuItemsResolved(),
        fetchCategories(),
        fetchActiveOrderItems(),
      ]);
      if (t.error) { setError(t.error.message); setLoading(false); return; }
      if (m.error) { setError(m.error.message); setLoading(false); return; }
      setTables(mapTablesResponse(t.data));
      if (m.data) setMenuItems(m.data);
      if (!c.error) setCategories(mapCategoriesResponse(c.data));
      if (!o.error) {
        setOrderItems((o.data as SupabaseOrderItemRow[] | null)?.map(mapOrderItemRow) ?? []);
      }
      setLoading(false);
    }
    void init();
  }, []);

  useEffect(() => {
    if (loading || error) return;
    const unsubs = [
      subscribeToPostgresRowChanges(
        "tables-row-sync",
        { event: "*", schema: "public", table: "tables" },
        (payload) => {
          setTables((prev) => applyTableRealtimeEvent(prev, payload));
        },
      ),
      subscribeToPostgresRowChanges(
        "order-items-row-sync",
        { event: "*", schema: "public", table: "order_items" },
        (payload) => {
          setOrderItems((prev) => applyOrderItemRealtimeEvent(prev, payload));
        },
      ),
      subscribeToMenuChanges(() => void reloadMenu(), realtimeOpts),
      subscribeToCategoryChanges(() => {
        void reloadCategories();
        void reloadMenu();
      }, realtimeOpts),
    ];
    return () => unsubs.forEach((u) => u());
  }, [loading, error, reloadMenu, reloadCategories]);

  useEffect(() => {
    if (loading || error || activeTab !== "storage") return;
    if (!inventoryLoaded) void reloadInventory();
    return subscribeToInventoryChanges(() => void reloadInventory(), realtimeOpts);
  }, [loading, error, activeTab, inventoryLoaded, reloadInventory]);

  useEffect(() => {
    if (loading || error || activeTab !== "summary") return;
    if (!salesLoaded) void reloadSales();
  }, [loading, error, activeTab, salesLoaded, reloadSales]);

  useEffect(() => {
    if (loading || error) return;
    let cancelled = false;
    const run = async () => {
      const { servedIds } = await autoServeExpiredReadyItems();
      if (cancelled || servedIds.length === 0) return;
      refreshFloorData();
    };
    void run();
    const timer = window.setInterval(() => void run(), AUTO_SERVE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loading, error, refreshFloorData]);

  useEffect(() => {
    if (!currentStaffUser) return;
    if (!canAccessNavTabForMember(currentStaffUser, activeTab)) {
      setActiveTab(firstAccessibleNavTab(currentStaffUser));
    }
  }, [currentStaffUser, activeTab]);

  const tableOrder = useTableOrderWorkflow({
    tables,
    setTables,
    menuItems,
    categories,
    orderItems,
    onRefresh: refreshPosData,
  });

  useSessionHealth({
    onRefresh: () => {
      refreshPosData();
      if (activeTab === "summary" || salesLoaded) void reloadSales();
      if (activeTab === "storage" || inventoryLoaded) void reloadInventory();
    },
    isBusy: () => tableOrder.modal != null,
    enabled: !loading && !error,
  });

  useEffect(() => {
    if (loading || error) return;
    return subscribePosSoftRefresh(() => {
      refreshPosData();
      if (salesLoaded) void reloadSales();
      if (inventoryLoaded) void reloadInventory();
    });
  }, [loading, error, refreshPosData, salesLoaded, inventoryLoaded, reloadSales, reloadInventory]);

  if (loading) return <LoadingShell />;
  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950">
          <p className="font-medium text-red-800 dark:text-red-200">Unable to load data</p>
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  const content = (() => {
    switch (activeTab) {
      case "map":
        return (
          <MapView
            tables={tables}
            setTables={setTables}
            menuItems={menuItems}
            orderItems={orderItems}
            onRefresh={refreshPosData}
            onTableClick={tableOrder.handleTableClick}
            actionError={tableOrder.actionError}
          />
        );
      case "order":
        return (
          <OrderView
            tables={tables}
            orderItems={orderItems}
            menuItems={menuItems}
            onOpenTable={(tableId) => tableOrder.openNewOrder(tableId, "append")}
            onCheckout={tableOrder.openCheckoutForTable}
            onChangeTable={tableOrder.openChangeTable}
            actionError={tableOrder.actionError}
            checkoutBusy={tableOrder.isSaving}
          />
        );
      case "reservations":
        return <ReservationsView tables={tables} onRefreshTables={reloadTables} />;
      case "history":
        return (
          <HistoryView
            menuItems={menuItems}
            onSaleUpdated={(updated) => {
              setSales((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
            }}
          />
        );
      case "summary":
        return <SummaryView sales={sales} menuItems={menuItems} onRefresh={reloadSales} />;
      case "storage":
        return (
          <StorageView
            inventory={inventory}
            menuItems={menuItems}
            categories={categories}
            onRefresh={() => {
              void reloadInventory();
              void reloadMenu();
              void reloadCategories();
            }}
          />
        );
      case "dynamicQr":
        return <DynamicQrServicesView />;
      case "staff":
        return <StaffView onRefresh={() => void refreshStaffList()} />;
      case "settings":
        return (
          <SettingsView
            menuItems={menuItems}
            categories={categories}
            onMenuChange={() => {
              void reloadMenu();
              void reloadCategories();
            }}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <div className="flex h-[100dvh] bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <ReadyNotificationListener tables={tables} menuItems={menuItems} />
      <MainNewOrderNotificationListener tables={tables} />
      <CallWaiterListener />
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AnnouncementMarquee surface="pos" />
        <main className="flex-1 overflow-hidden">{content}</main>
      </div>
      {tableOrder.tableOrderModals}
      <ChangelogPopupGate />
    </div>
  );
}
