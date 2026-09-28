"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ArrowLeft, ArrowRight, History, Loader2, RefreshCw } from "lucide-react";
import { AnnouncementMarquee } from "@/components/announcement-marquee";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import { useStationScreen } from "@/contexts/station-screen-context";
import { useSessionHealth } from "@/hooks/use-session-health";
import { AUTO_SERVE_POLL_MS, resolveKitchenStatus } from "@/lib/auto-serve";
import { POS_EGRESS } from "@/lib/egress-config";
import { isGrillGuestPrepOrder } from "@/lib/grill-guest-count";
import { usesKitchenScreen } from "@/lib/kitchen-fulfillment-mode";
import { orderItemDisplayName } from "@/lib/menu-display";
import {
  playCustomAlertSound,
  unlockNotificationAudio,
} from "@/lib/notification-sound";
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
  isPreparingColumnVisible,
  isReadyColumnVisible,
  nextServerScreenLanguage,
  normalizeServerScreenLanguages,
  preparationAgeMinutes,
  preparationHighlightTone,
  SERVER_SCREEN_LANG_ROTATE_MS,
  SERVER_SCREEN_READY_VISIBLE_MS,
  shouldShowGrillCompanions,
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
const COMPANION_DONE_KEY = "pos-server-screen-companion-done";
const MIN_SPLIT = 28;
const MAX_SPLIT = 72;

type BoardRow = {
  key: string;
  kind: "item" | "companion";
  item: StationOrderItem;
  tableLabel: string;
  parentId?: string;
  companionId?: string;
  companionName?: string;
  readyAt?: string;
};

type CompanionDoneMap = Record<string, string>;

function readStoredSplit(): number {
  if (typeof window === "undefined") return 55;
  const raw = Number(localStorage.getItem(SPLIT_STORAGE_KEY));
  if (!Number.isFinite(raw)) return 55;
  return Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, raw));
}

function companionStorageKey(station: Station) {
  return `${COMPANION_DONE_KEY}-${station}`;
}

function readCompanionDone(station: Station): CompanionDoneMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(companionStorageKey(station));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CompanionDoneMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCompanionDone(station: Station, map: CompanionDoneMap) {
  sessionStorage.setItem(companionStorageKey(station), JSON.stringify(map));
}

function prepRowClass(tone: PrepHighlightTone, selected: boolean): string {
  if (selected) return "bg-amber-300/85 text-zinc-950";
  if (tone === "critical") return "bg-red-950/70 text-[#f5f2ef] hover:bg-red-900/75";
  if (tone === "warn") return "bg-orange-950/55 text-[#f5f2ef] hover:bg-orange-900/60";
  return "bg-transparent text-[#f5f2ef] hover:bg-white/[0.04]";
}

function itemNote(item: StationOrderItem, language: LanguageCode): string | null {
  if (isGrillGuestPrepOrder(item)) return null;
  const primary =
    language === "zh"
      ? item.notesTranslated?.trim() || item.notes?.trim()
      : item.notes?.trim() || item.notesTranslated?.trim();
  return primary || null;
}

function formatOrderClock(iso: string | undefined, language: LanguageCode): string {
  if (!iso) return "—";
  return formatReadyClock(iso, language) || "—";
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
  const { currentStaffUser, soundKitchenEnabled } = useApp();
  const screenEnabled = usesKitchenScreen(settings.kitchenFulfillmentMode);
  const serverScreen = settings.serverScreen;
  const languages = useMemo(
    () => normalizeServerScreenLanguages(serverScreen.languageMode, serverScreen.languages),
    [serverScreen.languageMode, serverScreen.languages],
  );

  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [items, setItems] = useState<StationOrderItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [companionDone, setCompanionDone] = useState<CompanionDoneMap>({});
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [splitPercent, setSplitPercent] = useState(55);
  const [animatingOut, setAnimatingOut] = useState<Set<string>>(new Set());
  const dragRef = useRef<{ startX: number; startSplit: number } | null>(null);
  const splitPercentRef = useRef(55);
  const rotateResetRef = useRef(Date.now());
  const shellRef = useRef<HTMLDivElement | null>(null);
  const seenPreparingRef = useRef<Set<string> | null>(null);

  const actor = currentStaffUser?.name?.trim() || (station === "kitchen" ? "Kitchen" : "Bar");
  const realtimeOpts = { debounceMs: POS_EGRESS.REALTIME_DEBOUNCE_MS };
  const minLabel = translate("serverScreenMin");

  const playStationSound = useCallback(
    (variant: "newOrder" | "ready") => {
      if (!soundKitchenEnabled) return;
      unlockNotificationAudio();
      const url =
        variant === "newOrder"
          ? settings.soundConfigs.newOrder
          : settings.soundConfigs.itemReady;
      playCustomAlertSound(url, variant === "newOrder" ? "newOrder" : "ready");
    },
    [soundKitchenEnabled, settings.soundConfigs.newOrder, settings.soundConfigs.itemReady],
  );

  useEffect(() => {
    const initial = readStoredSplit();
    setSplitPercent(initial);
    splitPercentRef.current = initial;
    setCompanionDone(readCompanionDone(station));
  }, [station]);

  useEffect(() => {
    if (!languages.includes(language)) {
      setLanguage(languages[0] ?? "en");
    }
  }, [languages, language, setLanguage]);

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
    isBusy: () => busy || refreshing || historyOpen,
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

  // Sound on new preparing items (no popup).
  useEffect(() => {
    const pendingIds = new Set(
      items.filter((item) => isPreparingColumnVisible(item) && item.id).map((item) => item.id!),
    );
    if (seenPreparingRef.current == null) {
      seenPreparingRef.current = pendingIds;
      return;
    }
    let hasNew = false;
    for (const id of pendingIds) {
      if (!seenPreparingRef.current.has(id)) {
        hasNew = true;
        break;
      }
    }
    if (hasNew) playStationSound("newOrder");
    seenPreparingRef.current = pendingIds;
  }, [items, playStationSound]);

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
          const key = `${item.id}::${companion.id}`;
          if (companionDone[key]) continue;
          rows.push({
            key,
            kind: "companion",
            item,
            parentId: item.id,
            companionId: companion.id,
            tableLabel,
            companionName: companion.names[language] || companion.names.en,
          });
        }
      }
    }
    return rows;
  }, [items, itemsByTable, menuItems, tableLabelById, language, companionDone]);

  const readyRows = useMemo(() => {
    const rows: BoardRow[] = items
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
        readyAt: item.readyAt,
      }));

    for (const [key, readyAt] of Object.entries(companionDone)) {
      const readyMs = new Date(readyAt).getTime();
      if (Number.isNaN(readyMs) || nowMs - readyMs > SERVER_SCREEN_READY_VISIBLE_MS) continue;
      const [parentId, companionId] = key.split("::");
      if (!parentId || !companionId) continue;
      const parent = items.find((item) => item.id === parentId);
      if (!parent) continue;
      const companion = GRILL_FIRST_ORDER_COMPANIONS.find((row) => row.id === companionId);
      if (!companion) continue;
      rows.push({
        key,
        kind: "companion",
        item: parent,
        parentId,
        companionId,
        tableLabel: tableLabelById.get(parent.tableId) ?? "—",
        companionName: companion.names[language] || companion.names.en,
        readyAt,
      });
    }

    return rows.sort((a, b) => (a.readyAt ?? "").localeCompare(b.readyAt ?? ""));
  }, [items, nowMs, tableLabelById, companionDone, language]);

  const historyRows = useMemo(() => {
    const rows = items
      .filter((item) => {
        if (item.hideOnKds) return false;
        const status = resolveKitchenStatus(item);
        return status === "ready" || status === "served";
      })
      .slice()
      .sort((a, b) => {
        const at = a.readyAt ?? a.createdAt ?? "";
        const bt = b.readyAt ?? b.createdAt ?? "";
        return bt.localeCompare(at);
      });
    return rows;
  }, [items]);

  // Prune invalid selections; keep valid item + companion keys.
  useEffect(() => {
    const valid = new Set(preparingRows.map((row) => row.key));
    setSelectedKeys((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const key of prev) {
        if (valid.has(key)) next.add(key);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [preparingRows]);

  // Drop expired / orphaned companion done entries.
  useEffect(() => {
    setCompanionDone((prev) => {
      const next: CompanionDoneMap = {};
      let changed = false;
      for (const [key, readyAt] of Object.entries(prev)) {
        const readyMs = new Date(readyAt).getTime();
        if (Number.isNaN(readyMs) || nowMs - readyMs > SERVER_SCREEN_READY_VISIBLE_MS * 4) {
          changed = true;
          continue;
        }
        const parentId = key.split("::")[0];
        if (!items.some((item) => item.id === parentId)) {
          changed = true;
          continue;
        }
        next[key] = readyAt;
      }
      if (!changed) return prev;
      writeCompanionDone(station, next);
      return next;
    });
  }, [nowMs, items, station]);

  const toggleSelect = (key: string) => {
    unlockNotificationAudio();
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleMarkDone = async () => {
    if (busy || selectedKeys.size === 0) return;
    unlockNotificationAudio();
    const keys = Array.from(selectedKeys);
    setBusy(true);
    setAnimatingOut(new Set(keys));

    const realIds: string[] = [];
    const companionKeys: string[] = [];
    for (const key of keys) {
      if (key.includes("::")) companionKeys.push(key);
      else realIds.push(key);
    }

    const byTable = new Map<string, string[]>();
    for (const id of realIds) {
      const item = items.find((row) => row.id === id);
      if (!item) continue;
      const list = byTable.get(item.tableId) ?? [];
      list.push(id);
      byTable.set(item.tableId, list);
    }

    for (const [tableId, itemIds] of byTable) {
      await markItemsReady(itemIds, actor, tableId);
    }

    if (companionKeys.length > 0) {
      const readyAt = new Date().toISOString();
      setCompanionDone((prev) => {
        const next = { ...prev };
        for (const key of companionKeys) next[key] = readyAt;
        writeCompanionDone(station, next);
        return next;
      });
    }

    playStationSound("ready");
    setSelectedKeys(new Set());
    setBusy(false);
    window.setTimeout(() => setAnimatingOut(new Set()), 280);
    void reloadStationItems();
    void reloadTables();
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    unlockNotificationAudio();
    setRefreshing(true);
    try {
      await reloadAll();
    } finally {
      setRefreshing(false);
    }
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
  const selectedCount = selectedKeys.size;

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

  if (historyOpen) {
    return (
      <div className={shellClass} data-server-interactive>
        <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={() => setHistoryOpen(false)}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-3 text-sm font-medium text-[#F5EDE4] transition hover:bg-white/[0.08]"
          >
            <ArrowLeft className="h-4 w-4" />
            {translate("serverScreenHistoryBack")}
          </button>
          <h1 className="landing-serif text-2xl tracking-wide text-[#C9A88B]">
            {translate("history")}
          </h1>
          <span className="text-sm tabular-nums text-white/40">{historyRows.length}</span>
        </header>
        <div data-server-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {historyRows.length === 0 ? (
            <p className="px-4 py-12 text-center text-base text-white/35">{translate("noOrders")}</p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {historyRows.map((item) => {
                const name = orderItemDisplayName(item, menuItems, language);
                const note = itemNote(item, language);
                const tableLabel = tableLabelById.get(item.tableId) ?? "—";
                return (
                  <li key={item.id} className="px-4 py-3">
                    <div className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 text-[1.25rem] font-semibold leading-snug text-[#f5f2ef]">
                        {name}
                      </span>
                      <span className="w-12 shrink-0 text-right text-base font-bold tabular-nums text-[#E8D5C4] sm:w-14 sm:text-lg">
                        {tableLabel}
                      </span>
                    </div>
                    {note ? (
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/55">
                        {note}
                      </p>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-white/40">
                      <span>
                        {translate("serverScreenOrderTime")}: {formatOrderClock(item.createdAt, language)}
                      </span>
                      <span>
                        {translate("serverScreenReadyAt")}: {formatOrderClock(item.readyAt, language)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <ServerScreenFooter language={language} />
      </div>
    );
  }

  return (
    <div
      ref={shellRef}
      className={shellClass}
      onPointerDown={onBackgroundPointerDown}
    >
      <AnnouncementMarquee surface={station === "kitchen" ? "kds" : "bar"} tone="dark" />

      <div className="flex min-h-0 flex-1">
        <section
          className="flex min-h-0 min-w-0 flex-col border-r border-white/10"
          style={{ width: `${splitPercent}%` }}
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <h1 className="landing-serif text-2xl tracking-[0.08em] text-[#C9A88B] sm:text-3xl">
              {translate("preparing")}
            </h1>
            <span className="text-sm tabular-nums text-white/40">
              {preparingRows.filter((row) => row.kind === "item").length}
            </span>
          </header>
          <div data-server-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
            {preparingRows.length === 0 ? (
              <p className="px-4 py-10 text-center text-base text-white/35">{translate("noOrders")}</p>
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {preparingRows.map((row) => {
                  const selected = selectedKeys.has(row.key);
                  const age = preparationAgeMinutes(row.item.createdAt, nowMs);
                  const tone = preparationHighlightTone(age);
                  const leaving = animatingOut.has(row.key);
                  const name =
                    row.kind === "companion"
                      ? row.companionName ?? ""
                      : orderItemDisplayName(row.item, menuItems, language);
                  const note = row.kind === "item" ? itemNote(row.item, language) : null;

                  return (
                    <li key={row.key} className={selected ? "bg-amber-300/85" : undefined}>
                      <button
                        type="button"
                        data-server-interactive
                        onClick={() => toggleSelect(row.key)}
                        className={`flex w-full items-baseline gap-3 px-4 py-2.5 text-left transition-colors duration-150 ${prepRowClass(
                          tone,
                          selected,
                        )} ${leaving ? "translate-x-4 opacity-0 transition-all duration-200" : ""} ${
                          row.kind === "companion" ? "pl-8" : ""
                        }`}
                      >
                        <span
                          className={`min-w-0 flex-1 truncate text-[1.35rem] font-semibold leading-tight sm:text-[1.5rem] ${
                            row.kind === "companion" ? "font-medium" : ""
                          }`}
                          title={name}
                        >
                          {row.kind === "companion" ? (
                            <span className="mr-1.5 opacity-50">↳</span>
                          ) : null}
                          {name}
                        </span>
                        <span
                          className={`shrink-0 text-sm tabular-nums sm:text-[0.95rem] ${
                            selected ? "text-zinc-800/75" : "text-white/45"
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
                        <button
                          type="button"
                          data-server-interactive
                          onClick={() => toggleSelect(row.key)}
                          className={`w-full px-4 pb-2.5 text-left text-sm leading-relaxed whitespace-pre-wrap break-words ${
                            row.kind === "companion" ? "pl-8" : "pl-4"
                          } ${selected ? "text-zinc-800" : "text-white/55"}`}
                        >
                          {note}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

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

        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <h2 className="landing-serif text-2xl tracking-[0.08em] text-emerald-300/90 sm:text-3xl">
                {translate("ready")}
              </h2>
              <span className="text-sm tabular-nums text-white/40">{readyRows.length}</span>
            </div>
          </header>
          <div data-server-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
            {readyRows.length === 0 ? (
              <p className="px-4 py-10 text-center text-base text-white/30">&nbsp;</p>
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {readyRows.map((row) => {
                  const name =
                    row.kind === "companion"
                      ? row.companionName ?? ""
                      : orderItemDisplayName(row.item, menuItems, language);
                  const note = row.kind === "item" ? itemNote(row.item, language) : null;
                  const readyLabel = formatReadyClock(row.readyAt ?? row.item.readyAt, language);
                  return (
                    <li key={row.key} className="server-screen-ready-row px-4 py-2.5">
                      <div className={`flex items-baseline gap-3 ${row.kind === "companion" ? "pl-4" : ""}`}>
                        <span
                          className="min-w-0 flex-1 truncate text-[1.35rem] font-semibold leading-tight text-[#f5f2ef] sm:text-[1.5rem]"
                          title={name}
                        >
                          {row.kind === "companion" ? (
                            <span className="mr-1.5 opacity-50">↳</span>
                          ) : null}
                          {name}
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-emerald-300/80 sm:text-[0.95rem]">
                          {translate("serverScreenReadyAt")} {readyLabel}
                        </span>
                        <span className="w-12 shrink-0 text-right text-base font-bold tabular-nums text-[#E8D5C4] sm:w-14 sm:text-lg">
                          {row.tableLabel}
                        </span>
                      </div>
                      {note ? (
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/50">
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
      </div>

      {/* Floating toolbar above date/time footer */}
      <div className="relative z-20 shrink-0 px-3 pb-2 pt-1 sm:px-4">
        <div
          data-server-interactive
          className="mx-auto flex max-w-3xl items-center gap-2 rounded-2xl border border-white/12 bg-[#121214]/92 px-2 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md sm:gap-3 sm:px-3"
        >
          <button
            type="button"
            disabled={selectedCount === 0 || busy}
            onClick={() => void handleMarkDone()}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#8B1E2D] px-3 text-sm font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-[#A02435] disabled:cursor-not-allowed disabled:opacity-35 sm:text-base"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" strokeWidth={2.5} />}
            <span className="truncate">{translate("serverScreenMarkDone")}</span>
            {selectedCount > 0 ? (
              <span className="rounded-md bg-black/20 px-1.5 py-0.5 text-xs tabular-nums">{selectedCount}</span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 text-sm font-medium text-[#E8D5C4] transition hover:bg-white/[0.08] sm:px-4"
          >
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">{translate("history")}</span>
          </button>
          <button
            type="button"
            disabled={refreshing}
            onClick={() => void handleRefresh()}
            aria-label={translate("serverScreenRefresh")}
            className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 text-sm font-medium text-[#E8D5C4] transition hover:bg-white/[0.08] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{translate("serverScreenRefresh")}</span>
          </button>
        </div>
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
