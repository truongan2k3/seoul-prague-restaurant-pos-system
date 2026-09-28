"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowRight } from "lucide-react";
import { AnnouncementMarquee } from "@/components/announcement-marquee";
import { NewOrderNotificationListener } from "@/components/new-order-notification-listener";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import { useStationScreen } from "@/contexts/station-screen-context";
import { useSessionHealth } from "@/hooks/use-session-health";
import { AUTO_SERVE_POLL_MS } from "@/lib/auto-serve";
import { POS_EGRESS } from "@/lib/egress-config";
import { isGrillGuestPrepOrder } from "@/lib/grill-guest-count";
import { usesKitchenScreen } from "@/lib/kitchen-fulfillment-mode";
import { orderItemDisplayName } from "@/lib/menu-display";
import { subscribePosSoftRefresh } from "@/lib/pos-refresh";
import {
  applyStationOrderItemRealtimeEvent,
  applyTableRealtimeEvent,
  type StationOrderItem,
} from "@/lib/realtime-pos-sync";
import { subscribeToPostgresRowChanges } from "@/lib/realtime-subscribe";
import {
  formatPreparationMinutes,
  formatReadyClock,
  formatServerScreenFooterDate,
  formatServerScreenFooterTime,
  GRILL_FIRST_ORDER_COMPANIONS,
  nextServerScreenLanguage,
  normalizeServerScreenLanguages,
  preparationAgeMinutes,
  preparationHighlightTone,
  SERVER_SCREEN_LANG_ROTATE_MS,
  shouldShowGrillCompanions,
  isPreparingColumnVisible,
  isReadyColumnVisible,
  type PrepHighlightTone,
} from "@/lib/server-screen";
import type { LanguageCode, MenuItem, RestaurantTable, Station } from "@/lib/types";
import {
  autoFirePendingItems,
  autoServeExpiredReadyItems,
  markItemsReady,
} from "@/src/lib/table-actions";
import {
  fetchStationOrderItems,
  fetchTableSummaries,
  loadMenuItemsResolved,
  mapOrderItemRow,
  mapTablesResponse,
  subscribeToMenuChanges,
  type SupabaseOrderItemRow,
} from "@/src/lib/supabase-data";

const SPLIT_STORAGE_KEY = "pos-server-screen-split";
const MIN_SPLIT = 28;
const MAX_SPLIT = 72;

type BoardRow = {
  key: string;
  kind: "item" | "companion";
  item: StationOrderItem;
  tableLabel: string;
  /** Parent item id for companions */
  parentId?: string;
  companionName?: string;
};

function readStoredSplit(): number {
  if (typeof window === "undefined") return 55;
  const raw = Number(localStorage.getItem(SPLIT_STORAGE_KEY));
  if (!Number.isFinite(raw)) return 55;
  return Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, raw));
}

function prepRowClass(tone: PrepHighlightTone, selected: boolean): string {
  if (selected) {
    return "bg-amber-300/90 text-zinc-950";
  }
  if (tone === "critical") {
    return "bg-red-950/70 text-[#f5f2ef] hover:bg-red-900/75";
  }
  if (tone === "warn") {
    return "bg-orange-950/55 text-[#f5f2ef] hover:bg-orange-900/60";
  }
  return "bg-transparent text-[#f5f2ef] hover:bg-white/[0.04]";
}

function ServerScreenFooter({ language }: { language: LanguageCode }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!now) {
    return (
      <footer className="flex shrink-0 items-center justify-between border-t border-white/10 px-5 py-2 text-sm text-white/45">
        <span>&nbsp;</span>
        <span>&nbsp;</span>
      </footer>
    );
  }

  return (
    <footer className="flex shrink-0 items-center justify-between border-t border-white/10 px-5 py-2 text-sm tabular-nums text-white/55">
      <span className="truncate capitalize">{formatServerScreenFooterDate(now, language)}</span>
      <span className="shrink-0 font-semibold tracking-wide text-white/70">
        {formatServerScreenFooterTime(now, language)}
      </span>
    </footer>
  );
}

interface ServerScreenBoardProps {
  station: Station;
}

export function ServerScreenBoard({ station }: ServerScreenBoardProps) {
  const { language, setLanguage, translate } = useStationScreen();
  const { settings } = useSettings();
  const { currentStaffUser } = useApp();
  const screenEnabled = usesKitchenScreen(settings.kitchenFulfillmentMode);
  const serverScreen = settings.serverScreen;
  const languages = useMemo(
    () => normalizeServerScreenLanguages(serverScreen.languageMode, serverScreen.languages),
    [serverScreen.languageMode, serverScreen.languages],
  );

  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [items, setItems] = useState<StationOrderItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [splitPercent, setSplitPercent] = useState(55);
  const [animatingOut, setAnimatingOut] = useState<Set<string>>(new Set());
  const dragRef = useRef<{ startX: number; startSplit: number } | null>(null);
  const splitPercentRef = useRef(55);
  const rotateResetRef = useRef(Date.now());
  const shellRef = useRef<HTMLDivElement | null>(null);

  const actor = currentStaffUser?.name?.trim() || (station === "kitchen" ? "Kitchen" : "Bar");
  const realtimeOpts = { debounceMs: POS_EGRESS.REALTIME_DEBOUNCE_MS };
  const minLabel = translate("serverScreenMin");

  useEffect(() => {
    const initial = readStoredSplit();
    setSplitPercent(initial);
    splitPercentRef.current = initial;
  }, []);

  // Keep display language within configured set.
  useEffect(() => {
    if (!languages.includes(language)) {
      setLanguage(languages[0] ?? "en");
    }
  }, [languages, language, setLanguage]);

  // Auto-rotate languages.
  useEffect(() => {
    if (!serverScreen.autoRotateLanguage || languages.length < 2) return;
    const id = window.setInterval(() => {
      if (Date.now() - rotateResetRef.current < SERVER_SCREEN_LANG_ROTATE_MS - 200) return;
      setLanguage(nextServerScreenLanguage(language, languages));
      rotateResetRef.current = Date.now();
    }, SERVER_SCREEN_LANG_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [serverScreen.autoRotateLanguage, languages, language, setLanguage]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

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
      `server-screen-items-${station}`,
      { event: "*", schema: "public", table: "order_items" },
      (payload) => {
        setItems((prev) => applyStationOrderItemRealtimeEvent(prev, station, payload));
      },
    );
    const unsubTables = subscribeToPostgresRowChanges(
      `server-screen-tables-${station}`,
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
    isBusy: () => busy,
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
    const timer = window.setInterval(() => void runAutoServe(), AUTO_SERVE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [station, reloadStationItems]);

  const tableLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const table of tables) map.set(table.id, table.label);
    return map;
  }, [tables]);

  const itemsByTable = useMemo(() => {
    const map = new Map<string, StationOrderItem[]>();
    for (const item of items) {
      const list = map.get(item.tableId) ?? [];
      list.push(item);
      map.set(item.tableId, list);
    }
    return map;
  }, [items]);

  const preparingRows = useMemo(() => {
    const pending = items
      .filter((item) => isPreparingColumnVisible(item))
      .slice()
      .sort((a, b) => {
        const at = a.createdAt ?? "";
        const bt = b.createdAt ?? "";
        if (at !== bt) return at < bt ? -1 : 1;
        return (a.id ?? "").localeCompare(b.id ?? "");
      });

    const rows: BoardRow[] = [];
    for (const item of pending) {
      if (!item.id) continue;
      const tableLabel = tableLabelById.get(item.tableId) ?? "—";
      rows.push({
        key: item.id,
        kind: "item",
        item,
        tableLabel,
      });

      const tableSession = itemsByTable.get(item.tableId) ?? [];
      if (shouldShowGrillCompanions(item, tableSession, menuItems)) {
        for (const companion of GRILL_FIRST_ORDER_COMPANIONS) {
          rows.push({
            key: `${item.id}::${companion.id}`,
            kind: "companion",
            item,
            parentId: item.id,
            tableLabel,
            companionName: companion.names[language] || companion.names.en,
          });
        }
      }
    }
    return rows;
  }, [items, itemsByTable, menuItems, tableLabelById, language]);

  const readyRows = useMemo(() => {
    return items
      .filter((item) => isReadyColumnVisible(item, nowMs))
      .slice()
      .sort((a, b) => {
        const at = a.readyAt ?? "";
        const bt = b.readyAt ?? "";
        if (at !== bt) return at < bt ? -1 : 1;
        return (a.id ?? "").localeCompare(b.id ?? "");
      })
      .map((item) => ({
        key: item.id!,
        kind: "item" as const,
        item,
        tableLabel: tableLabelById.get(item.tableId) ?? "—",
      }));
  }, [items, nowMs, tableLabelById]);

  // Drop stale selections.
  useEffect(() => {
    const pendingIds = new Set(
      items.filter((item) => isPreparingColumnVisible(item) && item.id).map((item) => item.id!),
    );
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (pendingIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [items]);

  const toggleSelect = (itemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleMarkReady = async () => {
    if (busy || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setBusy(true);
    setAnimatingOut(new Set(ids));

    const byTable = new Map<string, string[]>();
    for (const id of ids) {
      const item = items.find((row) => row.id === id);
      if (!item) continue;
      const list = byTable.get(item.tableId) ?? [];
      list.push(id);
      byTable.set(item.tableId, list);
    }

    for (const [tableId, itemIds] of byTable) {
      await markItemsReady(itemIds, actor, tableId);
    }

    setSelectedIds(new Set());
    setBusy(false);
    window.setTimeout(() => setAnimatingOut(new Set()), 280);
    void reloadStationItems();
    void reloadTables();
  };

  const cycleLanguage = useCallback(() => {
    if (languages.length < 2) return;
    setLanguage(nextServerScreenLanguage(language, languages));
    rotateResetRef.current = Date.now();
  }, [languages, language, setLanguage]);

  const onBackgroundPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest("[data-server-interactive]")) return;
    if (target.closest("[data-server-scroll]")) return;
    cycleLanguage();
  };

  const onSplitPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { startX: event.clientX, startSplit: splitPercentRef.current };
    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current || !shellRef.current) return;
      const width = shellRef.current.getBoundingClientRect().width;
      if (width <= 0) return;
      const deltaPct = ((ev.clientX - dragRef.current.startX) / width) * 100;
      const next = Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, dragRef.current.startSplit + deltaPct));
      splitPercentRef.current = next;
      setSplitPercent(next);
    };
    const onUp = () => {
      localStorage.setItem(SPLIT_STORAGE_KEY, String(Math.round(splitPercentRef.current)));
      dragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const shellClass =
    "flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#0B0B0C] text-[#f5f2ef]";

  if (!screenEnabled) {
    return (
      <div className={shellClass}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="max-w-md text-lg font-medium text-zinc-300">
            {translate("kitchenScreenDisabledPaperMode")}
          </p>
          <p className="max-w-md text-sm text-zinc-500">
            {translate("kitchenScreenDisabledPaperModeHint")}
          </p>
        </div>
        <ServerScreenFooter language={language} />
      </div>
    );
  }

  const selectedCount = selectedIds.size;

  return (
    <div
      ref={shellRef}
      className={shellClass}
      onPointerDown={onBackgroundPointerDown}
    >
      <NewOrderNotificationListener station={station} tables={tables} menuItems={menuItems} />
      <AnnouncementMarquee surface={station === "kitchen" ? "kds" : "bar"} tone="dark" />

      <div className="flex min-h-0 flex-1">
        {/* Preparing */}
        <section
          className="flex min-h-0 min-w-0 flex-col border-r border-white/10"
          style={{ width: `${splitPercent}%` }}
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <h1 className="text-xl font-semibold uppercase tracking-[0.14em] text-[#C9A88B] sm:text-2xl">
              {translate("preparing")}
            </h1>
            <span className="text-sm tabular-nums text-white/40">{preparingRows.filter((r) => r.kind === "item").length}</span>
          </header>
          <div data-server-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {preparingRows.length === 0 ? (
              <p className="px-4 py-10 text-center text-base text-white/35">{translate("noOrders")}</p>
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {preparingRows.map((row) => {
                  const itemId = row.item.id!;
                  const selected = selectedIds.has(itemId);
                  const age = preparationAgeMinutes(row.item.createdAt, nowMs);
                  const tone = preparationHighlightTone(age);
                  const leaving = animatingOut.has(itemId);
                  const name =
                    row.kind === "companion"
                      ? row.companionName ?? ""
                      : isGrillGuestPrepOrder(row.item)
                        ? orderItemDisplayName(row.item, menuItems, language)
                        : orderItemDisplayName(row.item, menuItems, language);
                  const note =
                    row.kind === "item" && row.item.notes?.trim() && !isGrillGuestPrepOrder(row.item)
                      ? row.item.notes.trim()
                      : null;

                  return (
                    <li key={row.key}>
                      <button
                        type="button"
                        data-server-interactive
                        onClick={() => toggleSelect(itemId)}
                        className={`flex w-full items-baseline gap-3 px-4 py-2.5 text-left transition-colors duration-200 ${prepRowClass(
                          tone,
                          selected,
                        )} ${leaving ? "translate-x-4 opacity-0 transition-all duration-200" : ""} ${
                          row.kind === "companion" ? "pl-8" : ""
                        }`}
                      >
                        <span
                          className={`min-w-0 flex-1 truncate text-[1.35rem] font-semibold leading-tight tracking-tight sm:text-[1.55rem] ${
                            row.kind === "companion" ? "font-medium opacity-90" : ""
                          }`}
                          title={name}
                        >
                          {row.kind === "companion" ? (
                            <span className="mr-1.5 opacity-50">↳</span>
                          ) : null}
                          {name}
                        </span>
                        <span
                          className={`shrink-0 text-sm tabular-nums sm:text-base ${
                            selected ? "text-zinc-800/80" : "text-white/45"
                          }`}
                        >
                          {formatPreparationMinutes(row.item.createdAt, nowMs, minLabel)}
                        </span>
                        <span
                          className={`w-12 shrink-0 text-right text-base font-bold tabular-nums sm:w-14 sm:text-lg ${
                            selected ? "text-zinc-950" : "text-[#E8D5C4]"
                          }`}
                        >
                          {row.tableLabel}
                        </span>
                      </button>
                      {note ? (
                        <p
                          data-server-interactive
                          className={`-mt-1 truncate px-4 pb-2 text-sm italic ${
                            selected ? "bg-amber-300/90 pl-8 text-zinc-800" : "pl-8 text-white/40"
                          }`}
                          title={note}
                        >
                          {note}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Drag handle */}
        <div
          data-server-interactive
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={Math.round(splitPercent)}
          onPointerDown={onSplitPointerDown}
          className="relative z-10 w-3 shrink-0 cursor-col-resize bg-white/[0.03] hover:bg-[#C9A88B]/25"
          title="Resize"
        >
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/15" />
        </div>

        {/* Ready */}
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <h2 className="text-xl font-semibold uppercase tracking-[0.14em] text-emerald-300/90 sm:text-2xl">
                {translate("ready")}
              </h2>
              <span className="text-sm tabular-nums text-white/40">{readyRows.length}</span>
            </div>
            <button
              type="button"
              data-server-interactive
              disabled={selectedCount === 0 || busy}
              onClick={() => void handleMarkReady()}
              aria-label={translate("serverScreenMarkReady")}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#C9A88B]/45 bg-[#8B1E2D]/35 text-[#F5EDE4] transition hover:bg-[#8B1E2D]/55 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ArrowRight className="h-6 w-6" strokeWidth={2.5} />
            </button>
          </header>
          <div data-server-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {readyRows.length === 0 ? (
              <p className="px-4 py-10 text-center text-base text-white/30">&nbsp;</p>
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {readyRows.map((row) => {
                  const name = orderItemDisplayName(row.item, menuItems, language);
                  const readyLabel = formatReadyClock(row.item.readyAt, language);
                  return (
                    <li
                      key={row.key}
                      className="server-screen-ready-row flex items-baseline gap-3 px-4 py-2.5"
                    >
                      <span
                        className="min-w-0 flex-1 truncate text-[1.35rem] font-semibold leading-tight tracking-tight text-[#f5f2ef] sm:text-[1.55rem]"
                        title={name}
                      >
                        {name}
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-emerald-300/80 sm:text-base">
                        {translate("serverScreenReadyAt")} {readyLabel}
                      </span>
                      <span className="w-12 shrink-0 text-right text-base font-bold tabular-nums text-[#E8D5C4] sm:w-14 sm:text-lg">
                        {row.tableLabel}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      <ServerScreenFooter language={language} />
    </div>
  );
}

/** @deprecated Prefer ServerScreenBoard — kept for import compatibility. */
export function StationBoard({
  station,
}: {
  station: Station;
  variant?: "kitchen" | "bar";
}) {
  return <ServerScreenBoard station={station} />;
}
