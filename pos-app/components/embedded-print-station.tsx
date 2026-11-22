"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSettings } from "@/contexts/settings-context";
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
import { Activity, CheckCircle, ChevronDown, ChevronUp, Printer, RefreshCw, X, XCircle } from "lucide-react";

type JobLog = {
  id: string;
  at: string;
  label: string;
  ok: boolean;
  detail?: string;
};

const BATCH_MS = 1200;
const MAX_SEEN = 800;
const MAX_LOG = 30;

export function EmbeddedPrintStation() {
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
          const nextJob: PendingKitchenPrintJob = {
            ...job,
            orders: failedOrders,
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
      clearPrintStationAck(tableId);

      enqueuePrint(async () => {
        try {
          const printableOrders = filterAndClaimUnprintedOrders(orders);
          if (printableOrders.length === 0) {
            clearPrintStationAck(tableId);
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
            await broadcastPrintOk({ tableId, tableLabel });
          } catch {}
        } catch (error) {
          const message = error instanceof Error ? error.message : "Print failed";
          const pendingId = `ticket-${tableId}-${Date.now()}`;
          const failedOrders =
            error instanceof StationPrintPartialError ? error.unprintedOrders : orders;
          await rememberFailedJob({
            id: pendingId,
            kind: "ticket",
            tableId,
            tableLabel,
            orders: failedOrders,
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

  // Ping bridge periodically
  useEffect(() => {
    if (!isBridgeHost) return;
    let alive = true;
    const check = async () => {
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
    const id = window.setInterval(() => void check(), 15000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [isBridgeHost, settings.silentPrintEnabled, settings.printBridgeUrl]);

  // Ping all printers
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

  useEffect(() => {
    if (!isBridgeHost || bridgeOk !== true) return;
    void checkAllPrinters();
    const id = window.setInterval(() => void checkAllPrinters(), 25000);
    return () => window.clearInterval(id);
  }, [isBridgeHost, bridgeOk, checkAllPrinters]);

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

  if (!isBridgeHost) return null;

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
    <div className="fixed bottom-3 right-3 z-50 select-none">
      {/* Floating trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold shadow-lg transition-all ${
          !bridgeOk && settings.silentPrintEnabled
            ? "border-rose-400 bg-rose-600 text-white animate-pulse"
            : offlineCount > 0
              ? "border-amber-400 bg-amber-600 text-white"
              : isReady
                ? "border-emerald-300 bg-emerald-600 text-white hover:bg-emerald-700"
                : "border-zinc-300 bg-zinc-800 text-zinc-100"
        }`}
        title="Trạm in tích hợp trên POS"
      >
        <Printer className={`h-4 w-4 ${printing ? "animate-spin" : ""}`} />
        <span>
          {printing
            ? "Đang in..."
            : !bridgeOk && settings.silentPrintEnabled
              ? "Bridge offline"
              : offlineCount > 0
                ? `${offlineCount} máy in lỗi`
                : isReady
                  ? `Trạm in sẵn sàng (${onlineCount}/${enabledPrinters.length})`
                  : !isLeader
                    ? "Chế độ chờ"
                    : "Trạm in chưa sẵn sàng"}
        </span>
        {pending.length > 0 && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
            {pending.length}
          </span>
        )}
        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
      </button>

      {/* Slide-up panel */}
      {isOpen && (
        <div className="absolute bottom-12 right-0 w-80 sm:w-96 rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Printer className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Trạm in tích hợp (Print Station)
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 max-h-[70vh] overflow-y-auto space-y-3 pr-1 text-xs text-zinc-600 dark:text-zinc-300">
            {/* Status overview */}
            <div className="flex items-center justify-between rounded-xl bg-zinc-50 p-2.5 dark:bg-zinc-800/60">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${isReady ? "bg-emerald-500" : "bg-amber-500"}`}
                />
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {isReady ? "Đang lắng nghe & sẵn sàng in" : !isLeader ? "Tab phụ (chế độ chờ)" : "Chưa sẵn sàng"}
                </span>
              </div>
              <span className="text-[11px] text-zinc-400">
                Bridge: {bridgeOk ? "OK" : bridgeOk === false ? "Mất kết nối" : "—"}
              </span>
            </div>

            {/* Network printers */}
            <div>
              <div className="flex items-center justify-between font-semibold text-zinc-900 dark:text-zinc-100">
                <span>Máy in mạng</span>
                <button
                  type="button"
                  onClick={() => void checkAllPrinters()}
                  className="inline-flex items-center gap-1 text-[11px] text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  <RefreshCw className="h-3 w-3" />
                  Kiểm tra tất cả
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
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">{printer.name}</p>
                        <p className="text-[10px] text-zinc-400 truncate">{printer.host}:{printer.port}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {st?.checking ? (
                          <span className="text-[10px] text-amber-500">Đang test...</span>
                        ) : st?.ok === true ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                            <CheckCircle className="h-3 w-3" />
                            {st.latencyMs}ms
                          </span>
                        ) : st?.ok === false ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 font-medium" title={st.error}>
                            <XCircle className="h-3 w-3" />
                            Lỗi
                          </span>
                        ) : (
                          <span className="text-[10px] text-zinc-400">Chưa test</span>
                        )}
                        <button
                          type="button"
                          disabled={st?.checking}
                          onClick={() => void checkSinglePrinter(printer)}
                          className="rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] hover:bg-white dark:border-zinc-700 dark:hover:bg-zinc-700"
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
                  <span>Lệnh in lỗi ({pending.length})</span>
                </div>
                <div className="mt-2 space-y-2">
                  {pending.map((job) => (
                    <div
                      key={job.id}
                      className="flex items-center justify-between rounded-lg bg-white/90 p-2 shadow-sm dark:bg-zinc-800"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-semibold text-zinc-900 dark:text-zinc-100">{job.tableLabel || "Bàn"}</p>
                        <p className="text-[10px] text-rose-600 truncate">{job.error}</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          disabled={reprintingId === job.id}
                          onClick={() => reprintPending(job)}
                          className="rounded bg-rose-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-rose-700"
                        >
                          In lại
                        </button>
                        <button
                          type="button"
                          onClick={() => setPending((prev) => removePendingKitchenPrint(job.id, prev))}
                          className="rounded border border-zinc-300 px-1.5 py-1 text-[10px] hover:bg-zinc-100 dark:border-zinc-700"
                        >
                          Xóa
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent logs */}
            <div>
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">Lịch sử in gần đây</p>
              {logs.length === 0 ? (
                <p className="mt-1 text-[11px] text-zinc-400">Chưa có lệnh in nào trong phiên này.</p>
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
      )}
    </div>
  );
}
