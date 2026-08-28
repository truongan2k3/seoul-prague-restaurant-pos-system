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
import { ReservationReminderListener } from "@/components/reservation-reminder-listener";
import { POS_EGRESS } from "@/lib/egress-config";
import { clearPosInitCache, patchPosInitCacheMenu, readPosInitCache, readPosInitCacheStale, writePosInitCache } from "@/lib/pos-init-cache";
import { withTimeout } from "@/lib/fetch-timeout";
import { subscribePosSoftRefresh } from "@/lib/pos-refresh";
import { useTableOrderWorkflow } from "@/hooks/use-table-order-workflow";
import { useSessionHealth } from "@/hooks/use-session-health";
import { useApp } from "@/contexts/app-context";
import { AUTO_SERVE_POLL_MS } from "@/lib/auto-serve";
import { type TranslationKey } from "@/lib/i18n/translations";
import { canAccessNavTabForMember, firstAccessibleNavTab } from "@/lib/staff-roles";
import {
  fetchActiveOrderItems,
  fetchCategories,
  fetchInventory,
  fetchSales,
  fetchTableSummaries,
  loadMenuItemsForFloor,
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
import { ensureStorageCatalogSynced, resetStorageCatalogSync } from "@/src/lib/sync-storage-catalog";
import type { InventoryItem, MenuCategoryRecord, MenuItem, RestaurantTable, SaleRecord, OrderItem, NavId } from "@/lib/types";

type PosLoadStepId = "tables" | "menu" | "categories" | "orders";
type PosLoadStepStatus = "pending" | "loading" | "done" | "error";

type PosLoadStep = {
  id: PosLoadStepId;
  status: PosLoadStepStatus;
  ms?: number;
  cached?: boolean;
};

const POS_LOAD_SLOW_MS = 4_000;

const POS_LOAD_STEP_ORDER: PosLoadStepId[] = ["tables", "menu", "categories", "orders"];

const POS_LOAD_STEP_LABELS: Record<PosLoadStepId, TranslationKey> = {
  tables: "posLoadingTables",
  menu: "posLoadingMenu",
  categories: "posLoadingCategories",
  orders: "posLoadingOrders",
};

function initialPosLoadSteps(): PosLoadStep[] {
  return POS_LOAD_STEP_ORDER.map((id) => ({ id, status: "pending" }));
}

function PosLoadStepIcon({ status }: { status: PosLoadStepStatus }) {
  if (status === "done") {
    return (
      <span className="flex h-4 w-4 items-center justify-center text-emerald-600 dark:text-emerald-400" aria-hidden>
        ✓
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex h-4 w-4 items-center justify-center text-red-600 dark:text-red-400" aria-hidden>
        ✕
      </span>
    );
  }
  if (status === "loading") {
    return (
      <span
        className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700 dark:border-zinc-600 dark:border-t-zinc-200"
        aria-hidden
      />
    );
  }
  return <span className="inline-block h-3.5 w-3.5 rounded-full border border-zinc-300 dark:border-zinc-600" aria-hidden />;
}

function LoadingShell({
  steps,
  loadStartedAt,
  onRetry,
  onHardReset,
}: {
  steps: PosLoadStep[];
  loadStartedAt: number;
  onRetry: () => void;
  onHardReset: () => void;
}) {
  const { translate } = useApp();
  const [now, setNow] = useState(() => Date.now());
  const activeSteps = steps.filter((step) => step.status === "loading");
  const elapsedMs = now - loadStartedAt;
  const elapsedSec = Math.max(1, Math.ceil(elapsedMs / 1000));
  const showSlowActions = elapsedMs >= POS_LOAD_SLOW_MS;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100" />
        <p className="mt-4 text-sm font-medium text-zinc-800 dark:text-zinc-200">{translate("posLoadingTitle")}</p>
        <p className="mt-1 font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          {translate("posLoadingElapsed").replace("{s}", String(elapsedSec))}
        </p>
        {activeSteps.length > 0 ? (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {activeSteps.map((step) => translate(POS_LOAD_STEP_LABELS[step.id])).join(" · ")}
          </p>
        ) : null}
        <ul className="mt-5 space-y-2 rounded-xl border border-zinc-200 bg-white/80 px-4 py-3 text-left text-sm dark:border-zinc-700 dark:bg-zinc-900/80">
          {steps.map((step) => {
            const label = translate(POS_LOAD_STEP_LABELS[step.id]);
            const timing =
              step.status === "done" && step.cached
                ? translate("posLoadingFromCache")
                : step.status === "done" && step.ms != null
                  ? translate("posLoadingMs").replace("{ms}", String(step.ms))
                  : step.status === "pending"
                    ? translate("posLoadingPending")
                    : null;

            return (
              <li
                key={step.id}
                className={`flex items-center justify-between gap-3 ${
                  step.status === "loading"
                    ? "font-medium text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <PosLoadStepIcon status={step.status} />
                  <span className="truncate">{label}</span>
                </span>
                {timing ? (
                  <span
                    className={`shrink-0 font-mono text-xs tabular-nums ${
                      step.status === "done" && !step.cached && (step.ms ?? 0) >= 2000
                        ? "text-amber-700 dark:text-amber-300"
                        : ""
                    }`}
                  >
                    {timing}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        {showSlowActions ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-amber-800 dark:text-amber-200">{translate("posLoadingSlowHint")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={onRetry}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                {translate("posLoadingRetry")}
              </button>
              <button
                type="button"
                onClick={onHardReset}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-800 dark:border-zinc-600 dark:text-zinc-100"
              >
                {translate("posLoadingHardReset")}
              </button>
            </div>
          </div>
        ) : null}
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
  const { currentStaffUser, refreshStaffList, translate } = useApp();
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
  const [loadSteps, setLoadSteps] = useState<PosLoadStep[]>(initialPosLoadSteps);
  const [loadStartedAt, setLoadStartedAt] = useState(() => Date.now());
  const [initAttempt, setInitAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const retryPosLoad = useCallback(() => {
    setInitAttempt((attempt) => attempt + 1);
  }, []);

  const hardResetPosLoad = useCallback(() => {
    clearPosInitCache();
    resetStorageCatalogSync();
    window.location.reload();
  }, []);

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
    let cancelled = false;

    const patchLoadStep = (id: PosLoadStepId, patch: Partial<PosLoadStep>) => {
      setLoadSteps((prev) => prev.map((step) => (step.id === id ? { ...step, ...patch } : step)));
    };

    const trackLoadStep = async <T,>(id: PosLoadStepId, run: () => Promise<T>): Promise<T> => {
      const startedAt = performance.now();
      patchLoadStep(id, { status: "loading", cached: false });
      const result = await run();
      if (!cancelled) {
        patchLoadStep(id, {
          status: "done",
          ms: Math.round(performance.now() - startedAt),
          cached: false,
        });
      }
      return result;
    };

    const applyFreshCatalog = (
      t: Awaited<ReturnType<typeof fetchTableSummaries>>,
      m: Awaited<ReturnType<typeof loadMenuItemsResolved>>,
      c: Awaited<ReturnType<typeof fetchCategories>>,
    ) => {
      if (t.error || m.error || c.error) return false;
      const nextTables = mapTablesResponse(t.data);
      const nextMenu = m.data ?? [];
      const nextCategories = mapCategoriesResponse(c.data);
      setTables(nextTables);
      setMenuItems(nextMenu);
      setCategories(nextCategories);
      writePosInitCache({
        tables: nextTables,
        menuItems: nextMenu,
        categories: nextCategories,
      });
      return true;
    };

    async function loadMenuForBoot() {
      try {
        return await withTimeout(loadMenuItemsForFloor(), 12_000);
      } catch {
        const stale = readPosInitCacheStale();
        if (stale?.menuItems.length) {
          return { data: stale.menuItems, error: null };
        }
        return {
          data: null as MenuItem[] | null,
          error: new Error("Menu load timed out"),
        };
      }
    }

    async function hydrateFullMenuInBackground() {
      const full = await loadMenuItemsResolved();
      if (cancelled || full.error || !full.data) return;
      setMenuItems(full.data);
      patchPosInitCacheMenu(full.data);
    }

    async function refreshCatalogInBackground() {
      const [t, m, c] = await Promise.all([
        fetchTableSummaries(),
        loadMenuItemsResolved(),
        fetchCategories(),
      ]);
      if (cancelled) return;
      applyFreshCatalog(t, m, c);
    }

    async function init() {
      setLoading(true);
      setLoadStartedAt(Date.now());
      setLoadSteps(initialPosLoadSteps());
      setError(null);

      const cached = initAttempt === 0 ? readPosInitCache() : null;

      if (cached) {
        setTables(cached.tables);
        setMenuItems(cached.menuItems);
        setCategories(cached.categories);
        setLoadSteps([
          { id: "tables", status: "done", cached: true, ms: 0 },
          { id: "menu", status: "done", cached: true, ms: 0 },
          { id: "categories", status: "done", cached: true, ms: 0 },
          { id: "orders", status: "loading" },
        ]);

        const o = await trackLoadStep("orders", fetchActiveOrderItems);
        if (cancelled) return;
        if (o.error) {
          patchLoadStep("orders", { status: "error" });
        } else {
          setOrderItems((o.data as SupabaseOrderItemRow[] | null)?.map(mapOrderItemRow) ?? []);
        }
        setLoading(false);
        void refreshCatalogInBackground();
        return;
      }

      const [t, m, c, o] = await Promise.all([
        trackLoadStep("tables", fetchTableSummaries),
        trackLoadStep("menu", loadMenuForBoot),
        trackLoadStep("categories", fetchCategories),
        trackLoadStep("orders", fetchActiveOrderItems),
      ]);

      if (cancelled) return;

      if (t.error) {
        patchLoadStep("tables", { status: "error" });
        setError(t.error.message);
        setLoading(false);
        return;
      }
      if (m.error) {
        patchLoadStep("menu", { status: "error" });
        setError(m.error.message);
        setLoading(false);
        return;
      }

      applyFreshCatalog(t, m, c);
      if (o.error) {
        patchLoadStep("orders", { status: "error" });
      } else {
        setOrderItems((o.data as SupabaseOrderItemRow[] | null)?.map(mapOrderItemRow) ?? []);
      }
      setLoading(false);
      void hydrateFullMenuInBackground();
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [initAttempt]);

  useEffect(() => {
    if (loading || error) return;
    void ensureStorageCatalogSynced();
  }, [loading, error]);

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

  if (loading) {
    return (
      <LoadingShell
        steps={loadSteps}
        loadStartedAt={loadStartedAt}
        onRetry={retryPosLoad}
        onHardReset={hardResetPosLoad}
      />
    );
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950">
          <p className="font-medium text-red-800 dark:text-red-200">Unable to load data</p>
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={retryPosLoad}
              className="rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white"
            >
              {translate("posLoadingRetry")}
            </button>
            <button
              type="button"
              onClick={hardResetPosLoad}
              className="rounded-lg border border-red-300 px-4 py-2 text-xs font-semibold text-red-800 dark:border-red-700 dark:text-red-200"
            >
              {translate("posLoadingHardReset")}
            </button>
          </div>
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
      <ReservationReminderListener />
    </div>
  );
}
