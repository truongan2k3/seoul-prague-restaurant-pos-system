"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import { LanguageSelector } from "@/components/language-selector";
import { normalizeOrderItemStatus } from "@/lib/order-status";
import { shouldPrintKitchenOnSend } from "@/lib/kitchen-fulfillment-mode";
import type { MenuItem, OrderItem, RestaurantTable } from "@/lib/types";
import { applyTableRealtimeEvent } from "@/lib/realtime-pos-sync";
import { subscribeToPostgresRowChanges } from "@/lib/realtime-subscribe";
import { subscribePosSoftRefresh } from "@/lib/pos-refresh";
import { subscribeToKitchenPrintMessage, broadcastPrintFailed, broadcastPrintOk } from "@/lib/pos-notifications";
import {
  loadPendingKitchenPrints,
  removePendingKitchenPrint,
  upsertPendingKitchenPrint,
  type PendingKitchenPrintJob,
} from "@/lib/pending-kitchen-prints";
import { pingPrintBridge } from "@/src/lib/print-bridge-client";
import { printKitchenMessage, printKitchenTicket } from "@/src/lib/printKitchenTicket";
import {
  fetchTableSummaries,
  loadMenuItemsResolved,
  mapOrderItemRow,
  mapTableRow,
  subscribeToMenuChanges,
  subscribeToOrderItemInserts,
  type SupabaseOrderItemRow,
} from "@/src/lib/supabase-data";

type JobLog = {
  id: string;
  at: string;
  label: string;
  ok: boolean;
  detail?: string;
};

const BATCH_MS = 1200;
const MAX_SEEN = 800;
const MAX_LOG = 40;

export function PrintStationView() {
  const { language, setLanguage, translate } = useApp();
  const { settings } = useSettings();
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [bridgeOk, setBridgeOk] = useState<boolean | null>(null);
  const [bridgeDetail, setBridgeDetail] = useState("");
  const [listening, setListening] = useState(false);
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [pending, setPending] = useState<PendingKitchenPrintJob[]>([]);
  const [printing, setPrinting] = useState(false);
  const [reprintingId, setReprintingId] = useState<string | null>(null);

  const settingsRef = useRef(settings);
  const tablesRef = useRef(tables);
  const menuRef = useRef(menuItems);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const batchesRef = useRef<Map<string, { orders: OrderItem[]; timer: number }>>(new Map());
  const printChainRef = useRef<Promise<void>>(Promise.resolve());

  settingsRef.current = settings;
  tablesRef.current = tables;
  menuRef.current = menuItems;

  useEffect(() => {
    setPending(loadPendingKitchenPrints());
  }, []);

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
      .catch(() => {
        /* logged in task */
      })
      .finally(() => {
        setPrinting(false);
      });
  }, []);

  const rememberFailedJob = useCallback(
    async (job: PendingKitchenPrintJob) => {
      setPending((prev) => upsertPendingKitchenPrint(job, prev));
      try {
        await broadcastPrintFailed({
          tableId: job.tableId,
          tableLabel: job.tableLabel,
          detail: job.error,
          pendingId: job.id,
        });
      } catch {
        /* toast is best-effort */
      }
    },
    [],
  );

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
            label: job.tableLabel
              ? `${translate("table")} ${job.tableLabel}`
              : translate("kitchenMessageGeneral"),
            ok: true,
            detail: translate("printStationReprinted"),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Print failed";
          const nextJob: PendingKitchenPrintJob = {
            ...job,
            error: message,
            failedAt: new Date().toISOString(),
          };
          await rememberFailedJob(nextJob);
          pushLog({
            label: job.tableLabel
              ? `${translate("table")} ${job.tableLabel}`
              : translate("kitchenMessageGeneral"),
            ok: false,
            detail: message,
          });
        } finally {
          setReprintingId(null);
        }
      });
    },
    [enqueuePrint, pushLog, rememberFailedJob, translate],
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

      enqueuePrint(async () => {
        try {
          await printKitchenTicket({
            tableLabel,
            orders,
            menuItems: menuRef.current,
            settings: cfg,
          });
          pushLog({
            label: `${translate("table")} ${tableLabel}`,
            ok: true,
            detail: `${orders.length} ${translate("printStationItems")}`,
          });
          try {
            await broadcastPrintOk({ tableId, tableLabel });
          } catch {
            /* ack is best-effort — main POS may still timeout */
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Print failed";
          const pendingId = `ticket-${tableId}-${Date.now()}`;
          await rememberFailedJob({
            id: pendingId,
            kind: "ticket",
            tableId,
            tableLabel,
            orders,
            error: message,
            failedAt: new Date().toISOString(),
          });
          pushLog({
            label: `${translate("table")} ${tableLabel}`,
            ok: false,
            detail: message,
          });
        }
      });
    },
    [enqueuePrint, pushLog, rememberFailedJob, translate],
  );

  const queueInsert = useCallback(
    (row: SupabaseOrderItemRow) => {
      const cfg = settingsRef.current;
      if (!shouldPrintKitchenOnSend(cfg) || !cfg.kitchenPrintViaStation) return;

      const status = normalizeOrderItemStatus(row.status);
      const paperMode = cfg.kitchenFulfillmentMode === "paper";
      const printableStatus =
        status === "preparing" ||
        status === "pending" ||
        (paperMode && status === "served");
      if (!printableStatus) return;
      if (row.is_cancelled) return;
      if (row.skip_print) return;
      if (seenIdsRef.current.has(row.id)) return;

      seenIdsRef.current.add(row.id);
      if (seenIdsRef.current.size > MAX_SEEN) {
        const first = seenIdsRef.current.values().next().value;
        if (first) seenIdsRef.current.delete(first);
      }

      const item = mapOrderItemRow(row);
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
    [flushTableBatch],
  );

  useEffect(() => {
    void reloadCatalog();
    const unsubTables = subscribeToPostgresRowChanges(
      "print-station-tables",
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
  }, [reloadCatalog, reloadMenu]);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (!settings.silentPrintEnabled) {
        if (alive) {
          setBridgeOk(null);
          setBridgeDetail(translate("printStationBridgeOptional"));
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
  }, [settings.silentPrintEnabled, settings.printBridgeUrl, translate]);

  useEffect(() => {
    if (!shouldPrintKitchenOnSend(settings) || !settings.kitchenPrintViaStation) {
      setListening(false);
      return;
    }

    setListening(true);
    const unsubInserts = subscribeToOrderItemInserts(
      queueInsert,
      `print-station-inserts-${Date.now()}`,
    );
    const unsubMessages = subscribeToKitchenPrintMessage((payload) => {
      const cfg = settingsRef.current;
      if (!shouldPrintKitchenOnSend(cfg) || !cfg.kitchenPrintViaStation) return;
      enqueuePrint(async () => {
        try {
          await printKitchenMessage({
            tableLabel: payload.tableLabel,
            message: payload.message,
            messageZh: payload.messageZh,
            settings: cfg,
          });
          pushLog({
            label: payload.tableLabel?.trim()
              ? `${translate("table")} ${payload.tableLabel}`
              : translate("kitchenMessageGeneral"),
            ok: true,
            detail: translate("printStationMessageJob"),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Print failed";
          const pendingId = `msg-${Date.now()}`;
          await rememberFailedJob({
            id: pendingId,
            kind: "message",
            tableId: payload.tableId,
            tableLabel: payload.tableLabel?.trim() || translate("kitchenMessageGeneral"),
            message: payload.message,
            messageZh: payload.messageZh,
            error: message,
            failedAt: new Date().toISOString(),
          });
          pushLog({
            label: payload.tableLabel?.trim()
              ? `${translate("table")} ${payload.tableLabel}`
              : translate("kitchenMessageGeneral"),
            ok: false,
            detail: message,
          });
        }
      });
    });

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
    settings.kitchenFulfillmentMode,
    settings.kitchenPrintEnabled,
    settings.kitchenPrintViaStation,
    queueInsert,
    enqueuePrint,
    pushLog,
    rememberFailedJob,
    translate,
  ]);

  const statusReady =
    shouldPrintKitchenOnSend(settings) &&
    settings.kitchenPrintViaStation &&
    listening &&
    (!settings.silentPrintEnabled || bridgeOk === true);

  const notReadyReason = !shouldPrintKitchenOnSend(settings)
    ? translate("printStationNeedKitchenPrint")
    : !settings.kitchenPrintViaStation
      ? translate("printStationNeedViaStation")
      : !listening
        ? translate("printStationIdle")
        : settings.silentPrintEnabled && bridgeOk !== true
          ? translate("printStationNeedBridge")
          : null;

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            {translate("printStation")}
          </p>
          <h1 className="text-xl font-semibold">{translate("printStationTitle")}</h1>
          <p className="mt-1 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
            {translate("printStationHint")}
          </p>
        </div>
        <LanguageSelector
          variant="flag-menu"
          language={language}
          onLanguageChange={setLanguage}
        />
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-3">
            <span
              className={`h-3 w-3 shrink-0 rounded-full ${
                statusReady ? "bg-emerald-500" : "bg-amber-500"
              }`}
              aria-hidden
            />
            <div>
              <p className="font-medium">
                {statusReady
                  ? translate("printStationReady")
                  : translate("printStationNotReady")}
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {printing
                  ? translate("printStationPrinting")
                  : notReadyReason
                    ? notReadyReason
                    : listening
                      ? translate("printStationListening")
                      : translate("printStationIdle")}
              </p>
            </div>
          </div>

          <ul className="mt-4 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
            <li>
              {translate("settingsKitchenPrint")}:{" "}
              {shouldPrintKitchenOnSend(settings) ? "ON" : "OFF"}
            </li>
            <li>
              {translate("settingsKitchenPrintViaStation")}:{" "}
              {settings.kitchenPrintViaStation ? "ON" : "OFF"}
            </li>
            <li>
              {translate("settingsSilentPrint")}: {settings.silentPrintEnabled ? "ON" : "OFF"}
            </li>
            <li>
              {translate("settingsPrintBridgeUrl")}:{" "}
              <code className="break-all text-xs">{settings.printBridgeUrl}</code>
            </li>
            <li>
              Bridge:{" "}
              {bridgeOk === null
                ? "—"
                : bridgeOk
                  ? translate("printStationBridgeOk")
                  : translate("printStationBridgeFail")}
              {bridgeDetail ? ` (${bridgeDetail})` : ""}
            </li>
          </ul>
          {!statusReady && settings.silentPrintEnabled && bridgeOk === false ? (
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
              {translate("printStationBridgeHelp")}
            </p>
          ) : null}
        </section>

        <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <h2 className="font-semibold text-amber-950 dark:text-amber-100">
            {translate("printStationPendingTitle")}
          </h2>
          <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-200/80">
            {translate("printStationPendingHint")}
          </p>
          {pending.length === 0 ? (
            <p className="mt-2 text-sm text-amber-700/80 dark:text-amber-300/70">
              {translate("printStationPendingEmpty")}
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {pending.map((job) => (
                <li
                  key={job.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-amber-200/80 bg-white/80 p-3 text-sm dark:border-amber-900/60 dark:bg-zinc-900/70"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {job.tableLabel
                        ? `${translate("table")} ${job.tableLabel}`
                        : translate("kitchenMessageGeneral")}
                    </p>
                    <p className="text-zinc-600 dark:text-zinc-400">{job.error}</p>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {new Date(job.failedAt).toLocaleTimeString()}
                      {job.kind === "ticket" && job.orders
                        ? ` · ${job.orders.length} ${translate("printStationItems")}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={reprintingId === job.id || printing}
                      onClick={() => reprintPending(job)}
                      className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-amber-600"
                    >
                      {reprintingId === job.id
                        ? translate("printStationPrinting")
                        : translate("printStationReprint")}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPending((prev) => removePendingKitchenPrint(job.id, prev))
                      }
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold dark:border-zinc-600"
                    >
                      {translate("cancel")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-semibold">{translate("printStationRecent")}</h2>
          {logs.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              {translate("printStationWaiting")}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="flex items-start justify-between gap-3 border-b border-zinc-100 pb-2 text-sm last:border-0 dark:border-zinc-800"
                >
                  <div>
                    <p className="font-medium">
                      {log.ok ? "✓" : "✗"} {log.label}
                    </p>
                    {log.detail ? (
                      <p className="text-zinc-500 dark:text-zinc-400">{log.detail}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs text-zinc-400">{log.at}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
