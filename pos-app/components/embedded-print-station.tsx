"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useSettings } from "@/contexts/settings-context";
import { useApp } from "@/contexts/app-context";
import { normalizeOrderItemStatus } from "@/lib/order-status";
import { isKitchenMessageOrder } from "@/lib/kitchen-message-order";
import { shouldPrintKitchenOnSend } from "@/lib/kitchen-fulfillment-mode";
import type { MenuItem, NetworkPrinter, OrderItem, RestaurantTable } from "@/lib/types";
import { applyTableRealtimeEvent } from "@/lib/realtime-pos-sync";
import { subscribeToPostgresRowChanges } from "@/lib/realtime-subscribe";
import { subscribePosSoftRefresh } from "@/lib/pos-refresh";
import {
  subscribeToKitchenPrintMessage,
  broadcastPrintFailed,
  broadcastPrintOk,
  type KitchenPrintMessagePayload,
} from "@/lib/pos-notifications";
import {
  loadPendingKitchenPrints,
  removePendingKitchenPrint,
  upsertPendingKitchenPrint,
  type PendingKitchenPrintJob,
} from "@/lib/pending-kitchen-prints";
import { clearPrintStationAck } from "@/lib/print-station-ack";
import { pingPrintBridge, pingPrinter } from "@/src/lib/print-bridge-client";
import { printKitchenMessage, printKitchenTicket, StationPrintPartialError } from "@/src/lib/printKitchenTicket";
import {
  claimKitchenPrintItemId,
  claimKitchenPrintMessage,
  filterAndClaimUnprintedOrders,
  hasKitchenPrintItemIdBeenClaimed,
  registerPrintStationTab,
} from "@/lib/kitchen-print-dedupe";
import {
  fetchTableSummaries,
  loadMenuItemsResolved,
  mapOrderItemRow,
  mapTableRow,
  subscribeToMenuChanges,
  subscribeToOrderItemInserts,
  type SupabaseOrderItemRow,
} from "@/src/lib/supabase-data";
import { CheckCircle, Printer, RefreshCw, X, XCircle } from "lucide-react";

type JobLog = {
  id: string;
  at: string;
  label: string;
  ok: boolean;
  detail?: string;
};

interface PrintStationContextValue {
  isBridgeHost: boolean;
  isReady: boolean;
  isLeader: boolean;
  printing: boolean;
  bridgeOk: boolean | null;
  onlineCount: number;
  totalPrinters: number;
  offlineCount: number;
  pending: PendingKitchenPrintJob[];
  logs: JobLog[];
  printerStatuses: Record<string, { checking: boolean; ok?: boolean; latencyMs?: number; error?: string }>;
  isOpen: boolean;
  setIsOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  checkSinglePrinter: (printer: NetworkPrinter) => Promise<void>;
  checkAllPrinters: () => Promise<void>;
  reprintPending: (job: PendingKitchenPrintJob) => void;
  removePending: (id: string) => void;
}

const PrintStationContext = createContext<PrintStationContextValue | null>(null);

export function usePrintStation() {
  return useContext(PrintStationContext);
}

const BATCH_MS = 1200;
const MAX_SEEN = 800;
const MAX_LOG = 30;

export function PrintStationProvider({ children }: { children: ReactNode }) {
  const { translate } = useApp();
  const { settings } = useSettings();
  const [isBridgeHost, setIsBridgeHost] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [bridgeOk, setBridgeOk] = useState<boolean | null>(null);
  const [bridgeDetail, setBridgeDetail] = useState("");
  const [listening, setListening] = useState(false);
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [pending, setPending] = useState<PendingKitchenPrintJob[]>([]);
  const [printing, setPrinting] = useState(false);
  const [reprintingId, setReprintingId] = useState<string | null>(null);
  const [isLeader, setIsLeader] = useState(true);
  const [printerStatuses, setPrinterStatuses] = useState<
    Record<string, { checking: boolean; ok?: boolean; latencyMs?: number; error?: string }>
  >({});

  const tabIdRef = useRef("");
  if (!tabIdRef.current) {
    tabIdRef.current =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `embedded-tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  const settingsRef = useRef(settings);
  const tablesRef = useRef(tables);
  const menuRef = useRef(menuItems);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const batchesRef = useRef<Map<string, { orders: OrderItem[]; timer: number }>>(new Map());
  const printChainRef = useRef<Promise<void>>(Promise.resolve());

  settingsRef.current = settings;
  tablesRef.current = tables;
  menuRef.current = menuItems;

  // Sync bridge host setting from localStorage
  useEffect(() => {
    const checkHost = () => {
      if (typeof window !== "undefined") {
        setIsBridgeHost(localStorage.getItem("pos_is_print_bridge_host") === "true");
      }
    };
    checkHost();
    window.addEventListener("pos_bridge_host_changed", checkHost);
    window.addEventListener("storage", checkHost);
    return () => {
      window.removeEventListener("pos_bridge_host_changed", checkHost);
      window.removeEventListener("storage", checkHost);
    };
  }, []);

  // Leader election across tabs on this browser
  useEffect(() => {
    if (!isBridgeHost) return;
    const tab = registerPrintStationTab(tabIdRef.current);
    setIsLeader(tab.isLeader());
    const interval = window.setInterval(() => {
      setIsLeader(tab.heartbeat());
    }, 2500);
    return () => {
      window.clearInterval(interval);
      tab.resign();
    };
  }, [isBridgeHost]);

  useEffect(() => {
    if (!isBridgeHost) return;
    setPending(loadPendingKitchenPrints());
  }, [isBridgeHost]);

  const pushLog = useCallback((entry: Omit<JobLog, "id" | "at">) => {
    const row: JobLog = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      at: new Date().toLocaleTimeString(),
      ...entry,
    };
    setLogs((prev) => [row, ...prev].slice(0, MAX_LOG));
  }, []);

  useEffect(() => {
    const handleLog = (event: Event) => {
      const customEvent = event as CustomEvent<Omit<JobLog, "id" | "at">>;
      if (customEvent.detail) {
        pushLog(customEvent.detail);
      }
    };
    window.addEventListener("pos_print_station_log", handleLog);
    return () => window.removeEventListener("pos_print_station_log", handleLog);
  }, [pushLog]);

  const enqueuePrint = useCallback((task: () => Promise<void>) => {
    printChainRef.current = printChainRef.current
      .then(async () => {
        setPrinting(true);
        await task();
      })
      .catch(() => {})
      .finally(() => {
        setPrinting(false);
      });
  }, []);

  const rememberFailedJob = useCallback(async (job: PendingKitchenPrintJob) => {
    setPending((prev) => upsertPendingKitchenPrint(job, prev));
    try {
      await broadcastPrintFailed({
        tableId: job.tableId,
        tableLabel: job.tableLabel,
        detail: job.error,
        pendingId: job.id,
      });
    } catch {}
  }, []);

  const reprintPending = useCallback(
    (job: PendingKitchenPrintJob) => {
      const cfg = settingsRef.current;
      setReprintingId(job.id);
      enqueuePrint(async () => {
        try {
          if (job.kind === "ticket") {
            await printKitchenTicket({
              tableLabel: job.tableLabel,
              orders: job.orders ?? [],
              menuItems: menuRef.current,
              settings: cfg,
              onlyPrinterIds: job.onlyPrinterIds,
            });
          } else {
            await printKitchenMessage({
              tableLabel: job.tableLabel,
              message: job.message ?? "",
              messageZh: job.messageZh ?? "",
              settings: cfg,
            });
          }
          setPending((prev) => removePendingKitchenPrint(job.id, prev));
          pushLog({
            label: job.tableLabel ? `Bàn ${job.tableLabel}` : "Tin nhắn bếp",
            ok: true,
            detail: "Đã in lại thành công",
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Print failed";
          const failedOrders =
            error instanceof StationPrintPartialError ? error.unprintedOrders : (job.orders ?? []);
          const failedPrinterIds =
            error instanceof StationPrintPartialError ? error.failedPrinterIds : job.onlyPrinterIds;
          const nextJob: PendingKitchenPrintJob = {
            ...job,
            orders: failedOrders,
            onlyPrinterIds: failedPrinterIds,
            error: message,
            failedAt: new Date().toISOString(),
          };
          await rememberFailedJob(nextJob);
          pushLog({
            label: job.tableLabel ? `Bàn ${job.tableLabel}` : "Tin nhắn bếp",
            ok: false,
            detail: message,
          });
        } finally {
          setReprintingId(null);
        }
      });
    },
    [enqueuePrint, pushLog, rememberFailedJob],
  );

  const removePending = useCallback((id: string) => {
    setPending((prev) => removePendingKitchenPrint(id, prev));
  }, []);

  const reloadTables = useCallback(async () => {
    const tablesRes = await fetchTableSummaries();
    if (tablesRes.data) setTables(tablesRes.data.map(mapTableRow));
  }, []);

  const reloadMenu = useCallback(async () => {
    const menuRes = await loadMenuItemsResolved();
    if (menuRes.data) setMenuItems(menuRes.data);
  }, []);

  const reloadCatalog = useCallback(async () => {
    await Promise.all([reloadTables(), reloadMenu()]);
  }, [reloadMenu, reloadTables]);

  const flushTableBatch = useCallback(
    (tableId: string) => {
      const batch = batchesRef.current.get(tableId);
      batchesRef.current.delete(tableId);
      if (!batch || batch.orders.length === 0) return;

      const tableLabel =
        tablesRef.current.find((t) => t.id === tableId)?.label ?? tableId.slice(0, 6);
      const orders = batch.orders;
      const cfg = settingsRef.current;
      clearPrintStationAck(tableId, tableLabel);

      enqueuePrint(async () => {
        try {
          const printableOrders = filterAndClaimUnprintedOrders(orders);
          if (printableOrders.length === 0) {
            clearPrintStationAck(tableId, tableLabel);
            try {
              if (typeof window !== "undefined") {
                localStorage.setItem(
                  "pos_last_print_ok",
                  JSON.stringify({ tableId, tableLabel, at: Date.now() }),
                );
              }
              await broadcastPrintOk({ tableId, tableLabel });
              setTimeout(() => {
                void broadcastPrintOk({ tableId, tableLabel }).catch(() => {});
              }, 500);
            } catch {}
            return;
          }

          await printKitchenTicket({
            tableLabel,
            orders: printableOrders,
            menuItems: menuRef.current,
            settings: cfg,
          });
          pushLog({
            label: `Bàn ${tableLabel}`,
            ok: true,
            detail: `${printableOrders.length} món`,
          });
          try {
            if (typeof window !== "undefined") {
              localStorage.setItem(
                "pos_last_print_ok",
                JSON.stringify({ tableId, tableLabel, at: Date.now() }),
              );
            }
            await broadcastPrintOk({ tableId, tableLabel });
            setTimeout(() => {
              void broadcastPrintOk({ tableId, tableLabel }).catch(() => {});
            }, 500);
          } catch {}
        } catch (error) {
          const message = error instanceof Error ? error.message : "Print failed";
          const pendingId = `ticket-${tableId}-${Date.now()}`;
          const failedOrders =
            error instanceof StationPrintPartialError ? error.unprintedOrders : orders;
          const failedPrinterIds =
            error instanceof StationPrintPartialError ? error.failedPrinterIds : undefined;
          await rememberFailedJob({
            id: pendingId,
            kind: "ticket",
            tableId,
            tableLabel,
            orders: failedOrders,
            onlyPrinterIds: failedPrinterIds,
            error: message,
            failedAt: new Date().toISOString(),
          });
          pushLog({
            label: `Bàn ${tableLabel}`,
            ok: false,
            detail: message,
          });
        }
      });
    },
    [enqueuePrint, pushLog, rememberFailedJob],
  );

  const queueKitchenMessage = useCallback(
    (payload: KitchenPrintMessagePayload, acknowledge: (error?: string) => void = () => {}) => {
      const cfg = settingsRef.current;
      if (!shouldPrintKitchenOnSend(cfg) || !cfg.kitchenPrintViaStation) return;

      const msgKey =
        payload.jobId || `${payload.tableLabel ?? ""}:${payload.message}:${payload.at?.slice(0, 16) ?? ""}`;
      if (!claimKitchenPrintMessage(msgKey)) {
        acknowledge();
        return;
      }

      enqueuePrint(async () => {
        try {
          await printKitchenMessage({
            tableLabel: payload.tableLabel,
            message: payload.message,
            messageZh: payload.messageZh,
            settings: cfg,
          });
          acknowledge();
          if (payload.tableId) {
            await broadcastPrintOk({ tableId: payload.tableId, tableLabel: payload.tableLabel }).catch(() => {});
          }
          pushLog({
            label: payload.tableLabel?.trim() ? `Bàn ${payload.tableLabel}` : "Tin nhắn bếp",
            ok: true,
            detail: "Đã in tin nhắn bếp",
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Print failed";
          acknowledge(message);
          const pendingId = `msg-${Date.now()}`;
          await rememberFailedJob({
            id: pendingId,
            kind: "message",
            tableId: payload.tableId,
            tableLabel: payload.tableLabel?.trim() || "Tin nhắn bếp",
            message: payload.message,
            messageZh: payload.messageZh,
            error: message,
            failedAt: new Date().toISOString(),
          });
          pushLog({
            label: payload.tableLabel?.trim() ? `Bàn ${payload.tableLabel}` : "Tin nhắn bếp",
            ok: false,
            detail: message,
          });
        }
      });
    },
    [enqueuePrint, pushLog, rememberFailedJob],
  );

  const queueInsert = useCallback(
    (row: SupabaseOrderItemRow) => {
      const cfg = settingsRef.current;
      if (!shouldPrintKitchenOnSend(cfg) || !cfg.kitchenPrintViaStation) return;

      const status = normalizeOrderItemStatus(row.status);
      const paperMode = cfg.kitchenFulfillmentMode === "paper";
      const printableStatus =
        status === "preparing" || status === "pending" || (paperMode && status === "served");
      if (!printableStatus) return;
      if (row.is_cancelled) return;
      if (row.skip_print && !row.modifiers?.kitchenMessage) return;
      if (seenIdsRef.current.has(row.id)) return;
      if (hasKitchenPrintItemIdBeenClaimed(row.id)) return;

      seenIdsRef.current.add(row.id);
      if (seenIdsRef.current.size > MAX_SEEN) {
        const first = seenIdsRef.current.values().next().value;
        if (first) seenIdsRef.current.delete(first);
      }

      const item = mapOrderItemRow(row);
      if (isKitchenMessageOrder(item)) {
        queueKitchenMessage({
          tableId: row.table_id,
          tableLabel:
            tablesRef.current.find((t) => t.id === row.table_id)?.label ?? row.table_id.slice(0, 6),
          message: item.notes ?? item.name,
          messageZh: item.notesTranslated ?? item.name,
          at: item.createdAt ?? new Date().toISOString(),
        });
        return;
      }
      const existing = batchesRef.current.get(row.table_id);
      if (existing) {
        window.clearTimeout(existing.timer);
        existing.orders.push(item);
        existing.timer = window.setTimeout(() => flushTableBatch(row.table_id), BATCH_MS);
        return;
      }

      batchesRef.current.set(row.table_id, {
        orders: [item],
        timer: window.setTimeout(() => flushTableBatch(row.table_id), BATCH_MS),
      });
    },
    [flushTableBatch, queueKitchenMessage],
  );

  // Subscribe catalog changes
  useEffect(() => {
    if (!isBridgeHost) return;
    void reloadCatalog();
    const unsubTables = subscribeToPostgresRowChanges(
      "embedded-print-station-tables",
      { event: "*", schema: "public", table: "tables" },
      (payload) => {
        setTables((prev) => applyTableRealtimeEvent(prev, payload));
      },
    );
    const unsubMenu = subscribeToMenuChanges(() => void reloadMenu());
    const unsubSoft = subscribePosSoftRefresh(() => void reloadCatalog());
    return () => {
      unsubTables();
      unsubMenu();
      unsubSoft();
    };
  }, [isBridgeHost, reloadCatalog, reloadMenu]);

  // Ping bridge periodically (optimized to 60s, pauses when tab is hidden)
  useEffect(() => {
    if (!isBridgeHost) return;
    let alive = true;
    const check = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (!settings.silentPrintEnabled) {
        if (alive) {
          setBridgeOk(null);
          setBridgeDetail("Silent print tắt");
        }
        return;
      }
      const result = await pingPrintBridge(settings.printBridgeUrl);
      if (!alive) return;
      setBridgeOk(result.ok);
      setBridgeDetail(result.message);
    };
    void check();
    const id = window.setInterval(() => void check(), 60000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isBridgeHost, settings.silentPrintEnabled, settings.printBridgeUrl]);

  // Ping printer functions (optimized: only on-demand or when opened)
  const checkSinglePrinter = useCallback(
    async (printer: NetworkPrinter) => {
      if (!settings.silentPrintEnabled) return;
      setPrinterStatuses((prev) => ({
        ...prev,
        [printer.id]: { ...prev[printer.id], checking: true },
      }));
      const res = await pingPrinter(settings.printBridgeUrl, printer);
      setPrinterStatuses((prev) => ({
        ...prev,
        [printer.id]: { checking: false, ok: res.ok, latencyMs: res.latencyMs, error: res.error },
      }));
    },
    [settings.silentPrintEnabled, settings.printBridgeUrl],
  );

  const checkAllPrinters = useCallback(async () => {
    if (!settings.silentPrintEnabled || bridgeOk !== true) return;
    for (const printer of (settings.printers ?? []).filter((p) => p.enabled)) {
      void checkSinglePrinter(printer);
    }
  }, [settings.silentPrintEnabled, settings.printers, bridgeOk, checkSinglePrinter]);

  // Initial check once on startup, and refresh when user opens the panel
  useEffect(() => {
    if (!isBridgeHost || bridgeOk !== true) return;
    void checkAllPrinters();
  }, [isBridgeHost, bridgeOk, checkAllPrinters]);

  useEffect(() => {
    if (isOpen && isBridgeHost && bridgeOk === true) {
      void checkAllPrinters();
    }
  }, [isOpen, isBridgeHost, bridgeOk, checkAllPrinters]);

  // Subscribe to Realtime order items when leader
  useEffect(() => {
    if (
      !isBridgeHost ||
      !shouldPrintKitchenOnSend(settings) ||
      !settings.kitchenPrintViaStation ||
      !isLeader
    ) {
      setListening(false);
      return;
    }

    setListening(true);
    const unsubInserts = subscribeToOrderItemInserts(
      queueInsert,
      "print-station-inserts",
    );
    const unsubMessages = subscribeToKitchenPrintMessage(queueKitchenMessage);

    return () => {
      setListening(false);
      unsubInserts();
      unsubMessages();
      for (const batch of batchesRef.current.values()) {
        window.clearTimeout(batch.timer);
      }
      batchesRef.current.clear();
    };
  }, [
    isBridgeHost,
    settings.kitchenFulfillmentMode,
    settings.kitchenPrintEnabled,
    settings.kitchenPrintViaStation,
    isLeader,
    queueInsert,
    queueKitchenMessage,
  ]);

  const isReady =
    shouldPrintKitchenOnSend(settings) &&
    settings.kitchenPrintViaStation &&
    isLeader &&
    listening &&
    (!settings.silentPrintEnabled || bridgeOk === true);

  const printers = settings.printers ?? [];
  const enabledPrinters = printers.filter((p) => p.enabled);
  const onlineCount = enabledPrinters.filter((p) => printerStatuses[p.id]?.ok === true).length;
  const offlineCount = enabledPrinters.filter((p) => printerStatuses[p.id]?.ok === false).length;

  return (
    <PrintStationContext.Provider
      value={{
        isBridgeHost,
        isReady,
        isLeader,
        printing,
        bridgeOk,
        onlineCount,
        totalPrinters: enabledPrinters.length,
        offlineCount,
        pending,
        logs,
        printerStatuses,
        isOpen,
        setIsOpen,
        checkSinglePrinter,
        checkAllPrinters,
        reprintPending,
        removePending,
      }}
    >
      {children}
      {isBridgeHost && <EmbeddedPrintStationPanel />}
    </PrintStationContext.Provider>
  );
}

/** Small header icon button placed next to General message */
export function EmbeddedPrintStationButton() {
  const ctx = usePrintStation();
  const { translate } = useApp();
  if (!ctx || !ctx.isBridgeHost) return null;

  const { isReady, printing, bridgeOk, offlineCount, onlineCount, totalPrinters, pending, setIsOpen } = ctx;

  const statusColor =
    bridgeOk === false
      ? "bg-rose-500"
      : offlineCount > 0
        ? "bg-amber-500"
        : isReady
          ? "bg-emerald-500"
          : "bg-zinc-400";

  const buttonTitle =
    bridgeOk === false
      ? `${translate("printStation")}: Bridge offline`
      : offlineCount > 0
        ? `${translate("printStation")}: ${offlineCount} printer error`
        : isReady
          ? `${translate("printStation")}: ${translate("printStationReady")} (${onlineCount}/${totalPrinters})`
          : `${translate("printStation")}: Standby`;

  return (
    <button
      type="button"
      onClick={() => setIsOpen((prev) => !prev)}
      title={buttonTitle}
      aria-label={buttonTitle}
      className="relative inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5 text-[var(--foreground)] transition-colors hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
    >
      <Printer className={`h-5 w-5 shrink-0 ${printing ? "animate-spin text-emerald-500" : ""}`} aria-hidden />
      {/* Tiny status indicator dot on top-right */}
      <span className={`absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border border-[var(--card)] ${statusColor}`} />
      {pending.length > 0 && (
        <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white shadow-sm">
          {pending.length}
        </span>
      )}
    </button>
  );
}

/** Drawer/Modal panel showing print bridge & printer statuses */
export function EmbeddedPrintStationPanel() {
  const ctx = usePrintStation();
  const { translate } = useApp();
  const { settings } = useSettings();
  if (!ctx || !ctx.isBridgeHost || !ctx.isOpen) return null;

  const {
    isReady,
    isLeader,
    bridgeOk,
    printerStatuses,
    pending,
    logs,
    setIsOpen,
    checkAllPrinters,
    checkSinglePrinter,
    reprintPending,
    removePending,
  } = ctx;

  const printers = settings.printers ?? [];

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-end p-3 sm:p-4 bg-black/40 backdrop-blur-sm select-none">
      <div className="w-full max-w-sm sm:max-w-md rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {translate("printStation")}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 max-h-[75vh] overflow-y-auto space-y-3.5 pr-1 text-xs text-zinc-600 dark:text-zinc-300">
          {/* Status overview */}
          <div className="flex items-center justify-between rounded-xl bg-zinc-50 p-2.5 dark:bg-zinc-800/60">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${isReady ? "bg-emerald-500" : "bg-amber-500"}`}
              />
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {isReady
                  ? translate("printStationReady")
                  : !isLeader
                    ? "Standby (Another tab leader)"
                    : translate("printStationNotReady")}
              </span>
            </div>
            <span className="text-[11px] text-zinc-400">
              Bridge: {bridgeOk ? "OK" : bridgeOk === false ? "Offline" : "—"}
            </span>
          </div>

          {/* Network printers */}
          <div>
            <div className="flex items-center justify-between font-semibold text-zinc-900 dark:text-zinc-100">
              <span>{translate("settingsPrinters")}</span>
              <button
                type="button"
                onClick={() => void checkAllPrinters()}
                className="inline-flex items-center gap-1 text-[11px] text-emerald-600 hover:underline dark:text-emerald-400"
              >
                <RefreshCw className="h-3 w-3" />
                {translate("settingsPrinterPing")}
              </button>
            </div>
            <div className="mt-2 space-y-1.5">
              {printers.map((printer) => {
                const st = printerStatuses[printer.id];
                return (
                  <div
                    key={printer.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50/50 p-2 dark:border-zinc-800 dark:bg-zinc-800/40"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">{printer.name}</p>
                      <p className="text-[10px] text-zinc-400 truncate">{printer.host}:{printer.port}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {st?.checking ? (
                        <span className="text-[10px] text-amber-500">Checking...</span>
                      ) : st?.ok === true ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                          <CheckCircle className="h-3 w-3" />
                          {st.latencyMs}ms
                        </span>
                      ) : st?.ok === false ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 font-medium" title={st.error}>
                          <XCircle className="h-3 w-3" />
                          Offline
                        </span>
                      ) : (
                        <span className="text-[10px] text-zinc-400">—</span>
                      )}
                      <button
                        type="button"
                        disabled={st?.checking}
                        onClick={() => void checkSinglePrinter(printer)}
                        className="rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] font-medium hover:bg-white dark:border-zinc-700 dark:hover:bg-zinc-700"
                      >
                        Ping
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pending failed jobs */}
          {pending.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-2.5 dark:border-rose-900/50 dark:bg-rose-950/20">
              <div className="flex items-center justify-between font-semibold text-rose-900 dark:text-rose-200">
                <span>{translate("printStationPendingTitle")} ({pending.length})</span>
              </div>
              <div className="mt-2 space-y-2">
                {pending.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between rounded-lg bg-white/90 p-2 shadow-sm dark:bg-zinc-800"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100">{job.tableLabel || "Table"}</p>
                      <p className="text-[10px] text-rose-600 truncate">{job.error}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => reprintPending(job)}
                        className="rounded bg-rose-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-rose-700"
                      >
                        {translate("printStationReprint")}
                      </button>
                      <button
                        type="button"
                        onClick={() => removePending(job.id)}
                        className="rounded border border-zinc-300 px-1.5 py-1 text-[10px] hover:bg-zinc-100 dark:border-zinc-700"
                      >
                        {translate("cancel")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent logs */}
          <div>
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">{translate("printStationRecent")}</p>
            {logs.length === 0 ? (
              <p className="mt-1 text-[11px] text-zinc-400">{translate("printStationWaiting")}</p>
            ) : (
              <div className="mt-1.5 space-y-1">
                {logs.slice(0, 5).map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between border-b border-zinc-100 py-1 text-[11px] last:border-0 dark:border-zinc-800"
                  >
                    <span className={log.ok ? "text-emerald-600 font-medium" : "text-rose-600 font-medium"}>
                      {log.ok ? "✓" : "✕"} {log.label}
                    </span>
                    <span className="text-zinc-400">{log.at}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Backward compatibility alias */
export function EmbeddedPrintStation() {
  return null;
}
