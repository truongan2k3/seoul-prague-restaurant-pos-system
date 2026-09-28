"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  History,
  LayoutGrid,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { AnnouncementMarquee } from "@/components/announcement-marquee";
import { ServerScreenOrderCards } from "@/components/server-screen-order-cards";
import { ServerScreenPaymentOverlay } from "@/components/server-screen-payment-overlay";
import { ServerScreenPrepStatsPanel } from "@/components/server-screen-prep-stats";
import { ServerScreenReservationPanel } from "@/components/server-screen-reservation-panel";
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
  isNotificationAudioUnlocked,
  playCustomAlertSound,
  playServerScreenNewOrderAlert,
  unlockNotificationAudio,
} from "@/lib/notification-sound";
import {
  computePrepTimeStats,
  emptyPrepTimeStats,
  venueTodayRange,
  type PrepTimeStats,
} from "@/lib/prep-time-stats";
import { subscribePosSoftRefresh } from "@/lib/pos-refresh";
import {
  applyStationOrderItemRealtimeEvent,
  applyTableRealtimeEvent,
  type StationOrderItem,
} from "@/lib/realtime-pos-sync";
import { subscribeToPostgresRowChanges } from "@/lib/realtime-subscribe";
import {
  buildServerScreenOrderCards,
  companionKeyFor,
  emptyGrillCompanionStore,
  formatPreparationMinutes,
  formatReadyClock,
  formatServerScreenFooterDate,
  formatServerScreenFooterTime,
  formatServerScreenTicketId,
  GRILL_FIRST_ORDER_COMPANIONS,
  historyWithinRetention,
  isPreparingColumnVisible,
  mergeGrillCompanionAnchors,
  migrateGrillCompanionStore,
  nextServerScreenLanguage,
  normalizeServerScreenLanguages,
  pendingCompanionIds,
  preparationAgeMinutes,
  preparationHighlightTone,
  pruneGrillCompanionStore,
  readServerScreenLayoutMode,
  SERVER_SCREEN_HISTORY_VISIBLE_MS,
  SERVER_SCREEN_LANG_ROTATE_MS,
  serverScreenOrderWaveKey,
  shouldShowGrillCompanions,
  writeServerScreenLayoutMode,
  type GrillCompanionStore,
  type PrepHighlightTone,
  type ServerScreenLayoutMode,
  type ServerScreenOrderCardLine,
} from "@/lib/server-screen";
import { normalizeOrderItemStatus } from "@/lib/order-status";
import type { LanguageCode, MenuItem, RestaurantTable, Station } from "@/lib/types";
import {
  autoFirePendingItems,
  autoServeExpiredReadyItems,
  markItemsReady,
} from "@/src/lib/table-actions";
import {
  fetchStationHistoryItems,
  fetchStationOrderItems,
  fetchTableSummaries,
  fetchPrepTimeSamples,
  loadMenuItemsResolved,
  mapOrderItemRow,
  mapTablesResponse,
  subscribeToMenuChanges,
  type SupabaseOrderItemRow,
} from "@/src/lib/supabase-data";

const COMPANION_STORE_KEY = "pos-server-screen-companion-store";
const HISTORY_CACHE_KEY = "pos-server-screen-history-cache";
/** Collapse multi-line inserts from one Send into a single alert. */
const NEW_ORDER_SOUND_DEBOUNCE_MS = 700;
/** Hidden edge swipe (same idea as Client Screen). */
const SWIPE_EDGE_PX = 36;
const SWIPE_OPEN_PX = 72;
const SWIPE_CLOSE_PX = 64;

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

type HistoryRow = {
  key: string;
  name: string;
  tableLabel: string;
  note: string | null;
  orderedAt?: string;
  completedAt?: string;
  tableId?: string;
};

type HistoryCardGroup = {
  key: string;
  tableLabel: string;
  ticketId: string;
  orderedAt?: string;
  completedAt?: string;
  lines: Array<{ name: string; note: string | null; qty: number }>;
};

function companionStorageKey(station: Station) {
  return `${COMPANION_STORE_KEY}-${station}`;
}

function historyCacheKey(station: Station) {
  return `${HISTORY_CACHE_KEY}-${station}`;
}

function readCompanionStore(station: Station): GrillCompanionStore {
  if (typeof window === "undefined") return emptyGrillCompanionStore();
  try {
    const raw = sessionStorage.getItem(companionStorageKey(station));
    if (!raw) return emptyGrillCompanionStore();
    const parsed = JSON.parse(raw) as GrillCompanionStore | Record<string, string>;
    // Migrate legacy done-only map.
    if (parsed && typeof parsed === "object" && !("done" in parsed) && !("anchors" in parsed)) {
      return migrateGrillCompanionStore({
        done: parsed as Record<string, string>,
        anchors: {},
      });
    }
    const store = parsed as GrillCompanionStore;
    return migrateGrillCompanionStore({
      version: store.version,
      done: store.done && typeof store.done === "object" ? store.done : {},
      anchors: store.anchors && typeof store.anchors === "object" ? store.anchors : {},
    });
  } catch {
    return emptyGrillCompanionStore();
  }
}

function writeCompanionStore(station: Station, store: GrillCompanionStore) {
  sessionStorage.setItem(companionStorageKey(station), JSON.stringify(store));
}

function readHistoryCache(station: Station): HistoryRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(historyCacheKey(station));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistoryCache(station: Station, rows: HistoryRow[]) {
  try {
    localStorage.setItem(historyCacheKey(station), JSON.stringify(rows));
  } catch {
    /* ignore quota */
  }
}

function pruneHistoryRows(rows: HistoryRow[], nowMs = Date.now()): HistoryRow[] {
  return rows.filter((row) => historyWithinRetention(row.completedAt, nowMs));
}

function upsertHistoryRows(existing: HistoryRow[], incoming: HistoryRow[], nowMs = Date.now()): HistoryRow[] {
  const map = new Map<string, HistoryRow>();
  for (const row of existing) map.set(row.key, row);
  for (const row of incoming) {
    if (!row.key || !historyWithinRetention(row.completedAt, nowMs)) continue;
    map.set(row.key, row);
  }
  return pruneHistoryRows(Array.from(map.values()), nowMs).sort((a, b) =>
    (b.completedAt ?? "").localeCompare(a.completedAt ?? ""),
  );
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

  return (
    <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-white/15 bg-[#0B0B0C] px-4 py-2.5 text-sm tabular-nums text-white sm:px-5">
      <span className="min-w-0 truncate capitalize">
        {now ? formatServerScreenFooterDate(now, language) : "\u00a0"}
      </span>
      <span className="shrink-0 text-base font-semibold tracking-wide text-white">
        {now ? formatServerScreenFooterTime(now, language) : "\u00a0"}
      </span>
    </footer>
  );
}

function FloatingToolbar({
  selectedCount,
  busy,
  refreshing,
  onMarkDone,
  onHistory,
  onLayout,
  onRefresh,
  onPrepStats,
  markDoneLabel,
  historyLabel,
  layoutLabel,
  refreshLabel,
  prepStatsLabel,
  showMarkDone = true,
  showPrepStats = false,
  layoutActive = false,
}: {
  selectedCount: number;
  busy: boolean;
  refreshing: boolean;
  onMarkDone: () => void;
  onHistory: () => void;
  onLayout?: () => void;
  onRefresh: () => void;
  onPrepStats?: () => void;
  markDoneLabel: string;
  historyLabel: string;
  layoutLabel?: string;
  refreshLabel: string;
  prepStatsLabel?: string;
  showMarkDone?: boolean;
  showPrepStats?: boolean;
  layoutActive?: boolean;
}) {
  return (
    <div className="relative z-20 shrink-0 px-3 pb-2 pt-1 sm:px-4">
      <div
        data-server-interactive
        className="mx-auto flex max-w-4xl items-center gap-2 rounded-2xl border border-white/12 bg-[#121214]/95 px-2 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md sm:gap-3 sm:px-3"
      >
        {showMarkDone ? (
          <button
            type="button"
            disabled={selectedCount === 0 || busy}
            onClick={onMarkDone}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#8B1E2D] px-3 text-sm font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-[#A02435] disabled:cursor-not-allowed disabled:opacity-35 sm:text-base"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" strokeWidth={2.5} />}
            <span className="truncate">{markDoneLabel}</span>
            {selectedCount > 0 ? (
              <span className="rounded-md bg-black/20 px-1.5 py-0.5 text-xs tabular-nums">{selectedCount}</span>
            ) : null}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onHistory}
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 text-sm font-medium text-[#E8D5C4] transition hover:bg-white/[0.08] sm:px-4"
        >
          {showMarkDone ? <History className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
          <span className="hidden sm:inline">{historyLabel}</span>
        </button>
        {showPrepStats && onPrepStats ? (
          <button
            type="button"
            onClick={onPrepStats}
            aria-label={prepStatsLabel ?? "Stats"}
            title={prepStatsLabel}
            className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] text-[#E8D5C4] transition hover:bg-white/[0.08]"
          >
            <BarChart3 className="h-4 w-4" />
          </button>
        ) : null}
        {onLayout ? (
          <button
            type="button"
            onClick={onLayout}
            aria-label={layoutLabel ?? "Layout"}
            title={layoutLabel}
            aria-pressed={layoutActive}
            className={`inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition sm:px-4 ${
              layoutActive
                ? "border-[#C9A88B]/45 bg-[#C9A88B]/15 text-[#F5EDE4]"
                : "border-white/12 bg-white/[0.04] text-[#E8D5C4] hover:bg-white/[0.08]"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            <span className="hidden sm:inline">{layoutLabel ?? "Layout"}</span>
          </button>
        ) : null}
        <button
          type="button"
          disabled={refreshing}
          onClick={onRefresh}
          aria-label={refreshLabel}
          className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 text-sm font-medium text-[#E8D5C4] transition hover:bg-white/[0.08] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">{refreshLabel}</span>
        </button>
      </div>
    </div>
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
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [companionStore, setCompanionStore] = useState<GrillCompanionStore>(() =>
    emptyGrillCompanionStore(),
  );
  const [historyCache, setHistoryCache] = useState<HistoryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<ServerScreenLayoutMode>("list");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [animatingOut, setAnimatingOut] = useState<Set<string>>(new Set());
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [prepStats, setPrepStats] = useState<PrepTimeStats>(() => emptyPrepTimeStats());
  const [prepStatsLoading, setPrepStatsLoading] = useState(false);
  const [prepStatsOpen, setPrepStatsOpen] = useState(false);
  const [reservationsOpen, setReservationsOpen] = useState(false);
  const rotateResetRef = useRef(Date.now());
  const languageRef = useRef(language);
  const languagesRef = useRef(languages);
  const newOrderSoundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNewOrderSoundRef = useRef(false);
  const seenPreparingRef = useRef<Set<string>>(new Set());
  const preparingSeededRef = useRef(false);
  const lastAlertAtRef = useRef(0);
  const playNewOrderAlertRef = useRef<() => void>(() => {});
  const prepStatsCacheRef = useRef<{ key: string; stats: PrepTimeStats; at: number } | null>(null);
  const tableLabelByIdRef = useRef(new Map<string, string>());
  const menuItemsRef = useRef<MenuItem[]>([]);
  const touchRef = useRef<{ x: number; y: number; tracking: boolean } | null>(null);
  const prepStatsOpenRef = useRef(false);
  const reservationsOpenRef = useRef(false);
  prepStatsOpenRef.current = prepStatsOpen;
  reservationsOpenRef.current = reservationsOpen;
  languageRef.current = language;
  languagesRef.current = languages;

  const actor = currentStaffUser?.name?.trim() || (station === "kitchen" ? "Kitchen" : "Bar");
  const realtimeOpts = { debounceMs: POS_EGRESS.REALTIME_DEBOUNCE_MS };
  const minLabel = translate("serverScreenMin");

  /** Dedicated KDS/Bar always alerts — don't depend on POS kitchen-sound toggle. */
  const playNewOrderAlert = useCallback(() => {
    unlockNotificationAudio();
    if (!isNotificationAudioUnlocked()) {
      pendingNewOrderSoundRef.current = true;
    }
    // Web Audio triple-bell first (reliable; /sounds/*.mp3 are optional placeholders).
    playServerScreenNewOrderAlert();
    // Optional custom URL on top (falls back to bell if missing).
    const url = settings.soundConfigs.newOrder;
    if (url && !url.startsWith("/sounds/")) {
      playCustomAlertSound(url, "newOrder");
    }
    if (isNotificationAudioUnlocked()) setAudioUnlocked(true);
  }, [settings.soundConfigs.newOrder]);
  playNewOrderAlertRef.current = playNewOrderAlert;

  const playReadySound = useCallback(() => {
    unlockNotificationAudio();
    playCustomAlertSound(settings.soundConfigs.itemReady, "ready");
  }, [settings.soundConfigs.itemReady]);

  const scheduleNewOrderSound = useCallback(() => {
    if (newOrderSoundTimerRef.current) clearTimeout(newOrderSoundTimerRef.current);
    newOrderSoundTimerRef.current = setTimeout(() => {
      newOrderSoundTimerRef.current = null;
      const now = Date.now();
      // De-dupe INSERT + items-diff for the same Send burst.
      if (now - lastAlertAtRef.current < NEW_ORDER_SOUND_DEBOUNCE_MS) return;
      lastAlertAtRef.current = now;
      playNewOrderAlertRef.current();
    }, NEW_ORDER_SOUND_DEBOUNCE_MS);
  }, []);

  const flushPendingNewOrderSound = useCallback(() => {
    unlockNotificationAudio();
    if (isNotificationAudioUnlocked()) setAudioUnlocked(true);
    if (!pendingNewOrderSoundRef.current) return;
    if (!isNotificationAudioUnlocked()) return;
    pendingNewOrderSoundRef.current = false;
    playNewOrderAlertRef.current();
  }, []);

  const enableAudioWithTestBeep = useCallback(() => {
    unlockNotificationAudio();
    pendingNewOrderSoundRef.current = false;
    playServerScreenNewOrderAlert();
    // User gesture — hide banner immediately; ctx.state may lag one tick.
    setAudioUnlocked(true);
  }, []);

  // Browser autoplay: unlock on any interaction; replay missed new-order alert once unlocked.
  useEffect(() => {
    const unlock = () => {
      unlockNotificationAudio();
      flushPendingNewOrderSound();
      if (isNotificationAudioUnlocked()) setAudioUnlocked(true);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock, { passive: true });
    const poll = window.setInterval(() => {
      if (isNotificationAudioUnlocked()) {
        setAudioUnlocked(true);
        flushPendingNewOrderSound();
        window.clearInterval(poll);
      }
    }, 800);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
      window.clearInterval(poll);
    };
  }, [flushPendingNewOrderSound]);

  useEffect(() => {
    const store = readCompanionStore(station);
    setCompanionStore(store);
    writeCompanionStore(station, store);
    setHistoryCache(pruneHistoryRows(readHistoryCache(station)));
    setLayoutMode(readServerScreenLayoutMode());
    setBootstrapped(false);
    preparingSeededRef.current = false;
    seenPreparingRef.current = new Set();
  }, [station]);

  useEffect(() => {
    if (!languages.includes(language)) {
      setLanguage(languages[0] ?? "en");
    }
  }, [languages, language, setLanguage]);

  // Stable auto-rotate — refs avoid resetting the timer on every language change.
  useEffect(() => {
    if (!serverScreen.autoRotateLanguage) return;
    if (languages.length < 2) return;

    const id = window.setInterval(() => {
      const list = languagesRef.current;
      if (list.length < 2) return;
      // Manual tap resets the clock so we don't flip immediately after a tap.
      if (Date.now() - rotateResetRef.current < SERVER_SCREEN_LANG_ROTATE_MS - 400) return;
      const next = nextServerScreenLanguage(languageRef.current, list);
      if (next === languageRef.current) return;
      languageRef.current = next;
      setLanguage(next);
    }, SERVER_SCREEN_LANG_ROTATE_MS);

    return () => window.clearInterval(id);
  }, [serverScreen.autoRotateLanguage, languages.length, setLanguage]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const reloadStationItems = useCallback(async () => {
    await autoFirePendingItems(actor, station);
    const sinceIso = new Date(Date.now() - SERVER_SCREEN_HISTORY_VISIBLE_MS).toISOString();
    const [itemsRes, historyRes] = await Promise.all([
      fetchStationOrderItems(station),
      fetchStationHistoryItems(station, sinceIso),
    ]);
    setItems(
      ((itemsRes.data as SupabaseOrderItemRow[] | null) ?? []).map((row) => ({
        ...mapOrderItemRow(row),
        tableId: row.table_id,
        createdAt: row.created_at,
      })),
    );

    const historyIncoming: HistoryRow[] = ((historyRes.data as SupabaseOrderItemRow[] | null) ?? [])
      .filter((row) => !row.hide_on_kds && !row.is_cancelled)
      .map((row) => {
        const mapped = mapOrderItemRow(row);
        return {
          key: row.id,
          name: orderItemDisplayName(mapped, menuItemsRef.current, languageRef.current),
          tableLabel: tableLabelByIdRef.current.get(row.table_id) ?? "—",
          note: itemNote(
            { ...mapped, tableId: row.table_id, createdAt: row.created_at },
            languageRef.current,
          ),
          orderedAt: row.created_at,
          completedAt: row.ready_at ?? undefined,
          tableId: row.table_id,
        };
      });
    setHistoryCache((prev) => {
      const next = upsertHistoryRows(prev, historyIncoming);
      writeHistoryCache(station, next);
      return next;
    });
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

  const maybeAlertNewOrderInsert = useCallback(
    (payload: { eventType?: string; new?: Record<string, unknown> }) => {
      // Only realtime INSERTs — never soft-refresh / session-health / cache reloads.
      if (payload.eventType !== "INSERT") return;
      const row = payload.new as unknown as SupabaseOrderItemRow | undefined;
      if (!row?.id) return;
      if (row.station !== station) return;
      if (row.hide_on_kds) return;
      if (
        row.kitchen_status === "ready" ||
        row.kitchen_status === "served" ||
        row.kitchen_status === "cancelled" ||
        row.kitchen_status === "archived"
      ) {
        return;
      }
      const status = normalizeOrderItemStatus(row.status);
      // Include held — some flows insert held then fire via UPDATE; still worth a ping.
      if (status !== "preparing" && status !== "pending" && status !== "held") return;
      scheduleNewOrderSound();
    },
    [scheduleNewOrderSound, station],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await reloadAll();
      if (cancelled) return;
      setBootstrapped(true);
    })();
    const unsubItems = subscribeToPostgresRowChanges(
      `server-screen-items-${station}`,
      { event: "*", schema: "public", table: "order_items" },
      (payload) => {
        maybeAlertNewOrderInsert(payload);
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
      cancelled = true;
      unsubItems();
      unsubTables();
      unsubMenu();
      if (newOrderSoundTimerRef.current) {
        clearTimeout(newOrderSoundTimerRef.current);
        newOrderSoundTimerRef.current = null;
      }
    };
  }, [maybeAlertNewOrderInsert, reloadAll, reloadMenu, station]);

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

  // Backup detector: new preparing IDs after bootstrap (covers missed INSERT / UPDATE fire).
  // Soft-refresh / cache reload of the same tickets does not beep — only brand-new IDs.
  useEffect(() => {
    const pendingIds = new Set(
      items.filter((item) => isPreparingColumnVisible(item) && item.id).map((item) => item.id!),
    );

    // Before first load finishes, keep the seed in sync but never alert.
    if (!bootstrapped) {
      seenPreparingRef.current = pendingIds;
      preparingSeededRef.current = false;
      return;
    }

    // First snapshot after bootstrap — seed only (covers batched setItems + setBootstrapped).
    if (!preparingSeededRef.current) {
      seenPreparingRef.current = pendingIds;
      preparingSeededRef.current = true;
      return;
    }

    let hasNew = false;
    for (const id of pendingIds) {
      if (!seenPreparingRef.current.has(id)) {
        hasNew = true;
        break;
      }
    }
    if (hasNew) scheduleNewOrderSound();
    seenPreparingRef.current = pendingIds;
  }, [items, bootstrapped, scheduleNewOrderSound]);

  const tableLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const table of tables) map.set(table.id, table.label);
    return map;
  }, [tables]);
  tableLabelByIdRef.current = tableLabelById;
  menuItemsRef.current = menuItems;

  const itemsByTable = useMemo(() => {
    const map = new Map<string, StationOrderItem[]>();
    for (const item of items) {
      const list = map.get(item.tableId) ?? [];
      list.push(item);
      map.set(item.tableId, list);
    }
    return map;
  }, [items]);

  // Persist first-grill anchors so companions survive grill done/cancel/delete.
  useEffect(() => {
    setCompanionStore((prev) => {
      const merged = mergeGrillCompanionAnchors(prev, itemsByTable, menuItems);
      if (merged === prev) return prev;
      writeCompanionStore(station, merged);
      return merged;
    });
  }, [itemsByTable, menuItems, station]);

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

    // Resolve grill-set parent per table (companions belong under that set).
    const parentByTable = new Map<
      string,
      { parentId: string; host: StationOrderItem; createdAt: string }
    >();
    for (const [tableId, tableSession] of itemsByTable) {
      const anchor = companionStore.anchors[tableId];
      const firstId =
        tableSession.find((item) => shouldShowGrillCompanions(item, tableSession, menuItems))?.id ??
        anchor?.parentId;
      if (!firstId) continue;
      if (pendingCompanionIds(companionStore, firstId).length === 0) continue;
      const host =
        tableSession.find((item) => item.id === firstId) ??
        ({
          id: firstId,
          name: "Grill",
          quantity: 1,
          price: 0,
          tableId,
          createdAt: anchor?.createdAt,
          kitchenStatus: "pending",
          status: "preparing",
        } satisfies StationOrderItem);
      parentByTable.set(tableId, {
        parentId: firstId,
        host,
        createdAt: host.createdAt ?? anchor?.createdAt ?? "",
      });
    }

    const rows: BoardRow[] = [];
    const attachedParents = new Set<string>();

    const pushCompanions = (parentId: string, hostItem: StationOrderItem, tableLabel: string) => {
      if (attachedParents.has(parentId)) return;
      attachedParents.add(parentId);
      for (const companion of GRILL_FIRST_ORDER_COMPANIONS) {
        const key = companionKeyFor(parentId, companion.id);
        if (companionStore.done[key]) continue;
        rows.push({
          key,
          kind: "companion",
          item: hostItem,
          parentId,
          companionId: companion.id,
          tableLabel,
          companionName: companion.names[language] || companion.names.en,
        });
      }
    };

    for (const item of pending) {
      if (!item.id) continue;
      const tableLabel = tableLabelById.get(item.tableId) ?? "—";
      rows.push({
        key: item.id,
        kind: "item",
        item,
        tableLabel,
      });

      const parent = parentByTable.get(item.tableId);
      // Insert companions immediately under the grill set row.
      if (parent && parent.parentId === item.id) {
        pushCompanions(parent.parentId, parent.host, tableLabel);
      }
    }

    // Grill set already done/cancelled but companions still pending — place by createdAt.
    for (const [tableId, parent] of parentByTable) {
      if (attachedParents.has(parent.parentId)) continue;
      const tableLabel = tableLabelById.get(tableId) ?? "—";
      const companionRows: BoardRow[] = [];
      for (const companion of GRILL_FIRST_ORDER_COMPANIONS) {
        const key = companionKeyFor(parent.parentId, companion.id);
        if (companionStore.done[key]) continue;
        companionRows.push({
          key,
          kind: "companion",
          item: parent.host,
          parentId: parent.parentId,
          companionId: companion.id,
          tableLabel,
          companionName: companion.names[language] || companion.names.en,
        });
      }
      if (companionRows.length === 0) continue;
      attachedParents.add(parent.parentId);
      const insertAt = rows.findIndex((row) => (row.item.createdAt ?? "") > parent.createdAt);
      if (insertAt < 0) rows.push(...companionRows);
      else rows.splice(insertAt, 0, ...companionRows);
    }

    return rows;
  }, [items, itemsByTable, menuItems, tableLabelById, language, companionStore]);

  const orderCards = useMemo(
    () =>
      buildServerScreenOrderCards({
        items,
        menuItems,
        tableLabelById,
        language,
        companionStore,
        resolveName: (item) => orderItemDisplayName(item, menuItems, language),
        resolveNote: (item) => itemNote(item as StationOrderItem, language),
      }),
    [items, menuItems, tableLabelById, language, companionStore],
  );

  const historyRows = useMemo(() => {
    const rows: HistoryRow[] = [...historyCache];

    for (const [key, readyAt] of Object.entries(companionStore.done)) {
      if (!historyWithinRetention(readyAt, nowMs)) continue;
      const [parentId, companionId] = key.split("::");
      if (!parentId || !companionId) continue;
      const companion = GRILL_FIRST_ORDER_COMPANIONS.find((row) => row.id === companionId);
      if (!companion) continue;
      const anchor = Object.values(companionStore.anchors).find((row) => row.parentId === parentId);
      const parent = items.find((item) => item.id === parentId);
      const tableId = parent?.tableId ?? anchor?.tableId;
      rows.push({
        key,
        name: companion.names[language] || companion.names.en,
        tableLabel: tableId ? tableLabelById.get(tableId) ?? "—" : "—",
        note: null,
        orderedAt: parent?.createdAt ?? anchor?.createdAt,
        completedAt: readyAt,
        tableId,
      });
    }

    return pruneHistoryRows(rows, nowMs).sort((a, b) =>
      (b.completedAt ?? "").localeCompare(a.completedAt ?? ""),
    );
  }, [historyCache, companionStore, items, language, tableLabelById, nowMs]);

  const historyCards = useMemo(() => {
    type Acc = {
      key: string;
      tableLabel: string;
      ticketId: string;
      orderedAt?: string;
      completedAt?: string;
      lineMap: Map<string, { name: string; note: string | null; qty: number }>;
    };
    const groups = new Map<string, Acc>();

    for (const row of historyRows) {
      const waveId = serverScreenOrderWaveKey(row.tableId ?? row.tableLabel, row.orderedAt);
      // Skip waves still active on the preparing board.
      if (orderCards.some((card) => card.id === waveId)) continue;

      let group = groups.get(waveId);
      if (!group) {
        group = {
          key: waveId,
          tableLabel: row.tableLabel,
          ticketId: formatServerScreenTicketId(row.orderedAt),
          orderedAt: row.orderedAt,
          completedAt: row.completedAt,
          lineMap: new Map(),
        };
        groups.set(waveId, group);
      }
      if (row.orderedAt && (!group.orderedAt || row.orderedAt < group.orderedAt)) {
        group.orderedAt = row.orderedAt;
        group.ticketId = formatServerScreenTicketId(row.orderedAt);
      }
      if (row.completedAt && (!group.completedAt || row.completedAt > group.completedAt)) {
        group.completedAt = row.completedAt;
      }
      const lineKey = `${row.name}\u0001${row.note ?? ""}`;
      const existing = group.lineMap.get(lineKey);
      if (existing) existing.qty += 1;
      else group.lineMap.set(lineKey, { name: row.name, note: row.note, qty: 1 });
    }

    const result: HistoryCardGroup[] = Array.from(groups.values()).map((group) => ({
      key: group.key,
      tableLabel: group.tableLabel,
      ticketId: group.ticketId,
      orderedAt: group.orderedAt,
      completedAt: group.completedAt,
      lines: Array.from(group.lineMap.values()),
    }));

    return result.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  }, [historyRows, orderCards]);

  const loadTodayPrepStats = useCallback(async () => {
    const { dateIso, startIso, endExclusiveIso } = venueTodayRange();
    const cacheKey = `${station}:${dateIso}`;
    const cached = prepStatsCacheRef.current;
    if (cached && cached.key === cacheKey && Date.now() - cached.at < 90_000) {
      setPrepStats(cached.stats);
      return cached.stats;
    }

    setPrepStatsLoading(true);
    try {
      const { data, error } = await fetchPrepTimeSamples({
        startIso,
        endExclusiveIso,
        station,
        tableLabelById: tableLabelByIdRef.current,
      });
      if (error) {
        console.warn("[PrepStats] Failed:", error.message);
        const empty = emptyPrepTimeStats();
        setPrepStats(empty);
        return empty;
      }
      const next = computePrepTimeStats(data);
      prepStatsCacheRef.current = { key: cacheKey, stats: next, at: Date.now() };
      setPrepStats(next);
      return next;
    } finally {
      setPrepStatsLoading(false);
    }
  }, [station]);

  const openPrepStats = useCallback(() => {
    setReservationsOpen(false);
    setPrepStatsOpen(true);
    void loadTodayPrepStats();
  }, [loadTodayPrepStats]);

  const openReservations = useCallback(() => {
    setPrepStatsOpen(false);
    setReservationsOpen(true);
  }, []);

  // New preparing tickets dismiss stats so they never cover live orders.
  useEffect(() => {
    const pendingCount =
      layoutMode === "cards"
        ? orderCards.length
        : preparingRows.filter((row) => row.kind === "item").length;
    if (pendingCount === 0) return;
    if (prepStatsOpen) setPrepStatsOpen(false);
  }, [preparingRows, orderCards.length, layoutMode, prepStatsOpen]);

  useEffect(() => {
    const valid = new Set<string>();
    if (layoutMode === "cards") {
      for (const card of orderCards) {
        for (const line of card.lines) {
          for (const id of line.remainingIds) valid.add(id);
          if (line.companionKey && line.remainingIds.length > 0) valid.add(line.companionKey);
        }
      }
    } else {
      for (const row of preparingRows) valid.add(row.key);
    }
    setSelectedKeys((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const key of prev) {
        if (valid.has(key)) next.add(key);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [preparingRows, orderCards, layoutMode]);

  useEffect(() => {
    setCompanionStore((prev) => {
      const next = pruneGrillCompanionStore(prev, nowMs);
      if (next === prev) return prev;
      writeCompanionStore(station, next);
      return next;
    });
    setHistoryCache((prev) => {
      const next = pruneHistoryRows(prev, nowMs);
      if (next.length === prev.length) return prev;
      writeHistoryCache(station, next);
      return next;
    });
  }, [nowMs, station]);

  // Keep History populated for 2h even after checkout archives the DB rows.
  useEffect(() => {
    const incoming: HistoryRow[] = [];
    for (const item of items) {
      if (!item.id || item.hideOnKds || item.isCancelled) continue;
      const status = resolveKitchenStatus(item);
      if (status !== "ready" && status !== "served") continue;
      if (!historyWithinRetention(item.readyAt, nowMs)) continue;
      incoming.push({
        key: item.id,
        name: orderItemDisplayName(item, menuItems, language),
        tableLabel: tableLabelById.get(item.tableId) ?? "—",
        note: itemNote(item, language),
        orderedAt: item.createdAt,
        completedAt: item.readyAt,
        tableId: item.tableId,
      });
    }
    if (incoming.length === 0) return;
    setHistoryCache((prev) => {
      const next = upsertHistoryRows(prev, incoming, nowMs);
      writeHistoryCache(station, next);
      return next;
    });
  }, [items, menuItems, language, tableLabelById, nowMs, station]);

  const toggleSelect = (key: string) => {
    unlockNotificationAudio();
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleCardLine = (line: ServerScreenOrderCardLine) => {
    unlockNotificationAudio();
    if (line.kind === "companion") {
      if (!line.companionKey || line.remainingIds.length === 0) return;
      toggleSelect(line.companionKey);
      return;
    }
    if (line.remainingIds.length === 0) return;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const allSelected = line.remainingIds.every((id) => next.has(id));
      if (allSelected) {
        for (const id of line.remainingIds) next.delete(id);
      } else {
        for (const id of line.remainingIds) next.add(id);
      }
      return next;
    });
  };

  const setCardLineSelectedCount = (line: ServerScreenOrderCardLine, count: number) => {
    unlockNotificationAudio();
    if (line.kind !== "item" || line.remainingIds.length === 0) return;
    const clamped = Math.max(0, Math.min(count, line.remainingIds.length));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const id of line.remainingIds) next.delete(id);
      for (let i = 0; i < clamped; i += 1) {
        const id = line.remainingIds[i];
        if (id) next.add(id);
      }
      return next;
    });
  };

  const toggleLayoutMode = () => {
    unlockNotificationAudio();
    setLayoutMode((prev) => {
      const next: ServerScreenLayoutMode = prev === "cards" ? "list" : "cards";
      writeServerScreenLayoutMode(next);
      return next;
    });
    setSelectedKeys(new Set());
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
      setCompanionStore((prev) => {
        const next: GrillCompanionStore = {
          ...prev,
          done: { ...prev.done },
        };
        for (const key of companionKeys) next.done[key] = readyAt;
        writeCompanionStore(station, next);
        return next;
      });
      const companionHistory: HistoryRow[] = [];
      for (const key of companionKeys) {
        const [parentId, companionId] = key.split("::");
        if (!parentId || !companionId) continue;
        const companion = GRILL_FIRST_ORDER_COMPANIONS.find((row) => row.id === companionId);
        if (!companion) continue;
        const anchor = Object.values(companionStore.anchors).find((row) => row.parentId === parentId);
        const parent = items.find((item) => item.id === parentId);
        const tableId = parent?.tableId ?? anchor?.tableId;
        companionHistory.push({
          key,
          name: companion.names[language] || companion.names.en,
          tableLabel: tableId ? tableLabelById.get(tableId) ?? "—" : "—",
          note: null,
          orderedAt: parent?.createdAt ?? anchor?.createdAt,
          completedAt: readyAt,
          tableId,
        });
      }
      if (companionHistory.length > 0) {
        setHistoryCache((prev) => {
          const next = upsertHistoryRows(prev, companionHistory);
          writeHistoryCache(station, next);
          return next;
        });
      }
    }

    playReadySound();
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
    const list = languagesRef.current;
    if (list.length < 2) return;
    const next = nextServerScreenLanguage(languageRef.current, list);
    languageRef.current = next;
    setLanguage(next);
    rotateResetRef.current = Date.now();
  }, [setLanguage]);

  // Hidden gesture (like Client Screen): swipe right from left edge → reservations.
  // Prep stats open from the toolbar button instead.
  const onTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    unlockNotificationAudio();
    if (historyOpen) return;
    const touch = event.touches[0];
    if (!touch) return;
    const fromLeftEdge = touch.clientX <= SWIPE_EDGE_PX;
    const anyPanelOpen = prepStatsOpenRef.current || reservationsOpenRef.current;
    if (!anyPanelOpen && !fromLeftEdge) {
      touchRef.current = null;
      return;
    }
    touchRef.current = { x: touch.clientX, y: touch.clientY, tracking: true };
  };

  const onTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start?.tracking || historyOpen) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - start.x;
    const dy = Math.abs(touch.clientY - start.y);
    if (dy > Math.abs(dx) * 0.85) return;

    if (reservationsOpenRef.current) {
      if (dx <= -SWIPE_CLOSE_PX) setReservationsOpen(false);
      return;
    }
    if (prepStatsOpenRef.current) {
      if (dx <= -SWIPE_CLOSE_PX || dx >= SWIPE_CLOSE_PX) setPrepStatsOpen(false);
      return;
    }

    if (dx >= SWIPE_OPEN_PX && start.x <= SWIPE_EDGE_PX) {
      openReservations();
    }
  };

  const onBackgroundPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    unlockNotificationAudio();
    flushPendingNewOrderSound();
    const target = event.target as HTMLElement | null;
    if (!target) return;
    // Don't steal taps from buttons / toolbar / list rows.
    if (target.closest("[data-server-interactive]")) return;
    if (target.closest("button, a, input, select, textarea, [role='button']")) return;
    if (prepStatsOpen || reservationsOpen) return;
    cycleLanguage();
  };

  const shellClass =
    "flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#0B0B0C] text-[#f5f2ef]";
  const selectedCount = selectedKeys.size;
  const paymentOverlayEnabled =
    station === "kitchen" && Boolean(serverScreen.showPaymentOverlayOnKds);

  const withPaymentOverlay = (node: ReactNode) => (
    <ServerScreenPaymentOverlay enabled={paymentOverlayEnabled} translate={translate}>
      {node}
    </ServerScreenPaymentOverlay>
  );

  if (!screenEnabled) {
    return withPaymentOverlay(
      <div className={shellClass}>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="max-w-md text-lg font-medium text-zinc-300">
            {translate("kitchenScreenDisabledPaperMode")}
          </p>
          <p className="max-w-md text-sm text-zinc-500">
            {translate("kitchenScreenDisabledPaperModeHint")}
          </p>
        </div>
        <ServerScreenFooter language={language} />
      </div>,
    );
  }

  if (historyOpen) {
    return withPaymentOverlay(
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
          <h1 className="font-serif text-xl font-semibold tracking-tight text-white sm:text-2xl">
            {translate("history")}
          </h1>
          <span className="text-sm tabular-nums text-white/40">
            {layoutMode === "cards" ? historyCards.length : historyRows.length}
          </span>
        </header>
        <div data-server-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {layoutMode === "cards" ? (
            historyCards.length === 0 ? (
              <p className="px-4 py-12 text-center text-base text-white/35">{translate("noOrders")}</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
                {historyCards.map((card) => (
                  <article
                    key={card.key}
                    className="overflow-hidden rounded-xl border border-white/10 bg-[#121214]"
                  >
                    <header className="flex items-start justify-between gap-2 border-b border-white/10 bg-[#1c1c1f] px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="font-serif text-xl font-semibold text-[#F5EDE4]">
                          {card.tableLabel}
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums text-white/40">#{card.ticketId}</p>
                      </div>
                    </header>
                    <ul className="divide-y divide-white/[0.06] px-1 py-1">
                      {card.lines.map((line, index) => (
                        <li key={`${line.name}-${index}`} className="px-2.5 py-1.5">
                          <div className="flex min-w-0 items-baseline gap-2">
                            <span className="min-w-0 flex-1 truncate text-[0.95rem] font-medium text-[#f5f2ef]">
                              {line.name}
                            </span>
                            <span className="shrink-0 text-sm font-bold tabular-nums text-[#E8D5C4]">
                              {line.qty}
                            </span>
                          </div>
                          {line.note ? (
                            <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-white/45">
                              {line.note}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    <footer className="flex flex-wrap gap-x-4 gap-y-1 border-t border-white/[0.06] px-3 py-2 text-xs tabular-nums text-white/40">
                      <span>
                        {translate("serverScreenOrderTime")}:{" "}
                        {formatOrderClock(card.orderedAt, language)}
                      </span>
                      <span>
                        {translate("serverScreenReadyAt")}:{" "}
                        {formatOrderClock(card.completedAt, language)}
                      </span>
                    </footer>
                  </article>
                ))}
              </div>
            )
          ) : historyRows.length === 0 ? (
            <p className="px-4 py-12 text-center text-base text-white/35">{translate("noOrders")}</p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {historyRows.map((row) => (
                <li key={row.key} className="px-4 py-3">
                  <div className="flex flex-nowrap items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-[1.25rem] font-semibold leading-snug text-[#f5f2ef]">
                      {row.name}
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-right text-base font-bold tabular-nums text-[#E8D5C4] sm:text-lg">
                      {row.tableLabel}
                    </span>
                  </div>
                  {row.note ? (
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/55">
                      {row.note}
                    </p>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-white/40">
                    <span>
                      {translate("serverScreenOrderTime")}: {formatOrderClock(row.orderedAt, language)}
                    </span>
                    <span>
                      {translate("serverScreenReadyAt")}: {formatOrderClock(row.completedAt, language)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <FloatingToolbar
          selectedCount={0}
          busy={false}
          refreshing={refreshing}
          onMarkDone={() => undefined}
          onHistory={() => setHistoryOpen(false)}
          onLayout={toggleLayoutMode}
          onRefresh={() => void handleRefresh()}
          markDoneLabel={translate("serverScreenMarkDone")}
          historyLabel={translate("serverScreenHistoryBack")}
          layoutLabel={translate("serverScreenLayout")}
          refreshLabel={translate("serverScreenRefresh")}
          showMarkDone={false}
          layoutActive={layoutMode === "cards"}
        />
        <ServerScreenFooter language={language} />
      </div>,
    );
  }

  return withPaymentOverlay(
    <div
      className={shellClass}
      onPointerDown={onBackgroundPointerDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <AnnouncementMarquee surface={station === "kitchen" ? "kds" : "bar"} tone="dark" />

      {!audioUnlocked ? (
        <button
          type="button"
          data-server-interactive
          onClick={enableAudioWithTestBeep}
          className="shrink-0 border-b border-amber-400/30 bg-amber-500/15 px-4 py-2.5 text-center text-sm font-medium text-amber-100 transition hover:bg-amber-500/25"
        >
          {translate("serverScreenEnableSound")}
        </button>
      ) : null}

      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <header
          className="flex shrink-0 cursor-pointer items-center justify-between gap-3 border-b border-white/10 px-4 py-3"
          onPointerDown={(event) => {
            // Tapping the title area cycles language (manual override).
            event.stopPropagation();
            if (prepStatsOpen || reservationsOpen) return;
            cycleLanguage();
          }}
        >
          <h1
            className={`text-xl font-semibold text-white sm:text-2xl ${
              layoutMode === "cards"
                ? "font-serif tracking-tight"
                : "uppercase tracking-[0.14em]"
            }`}
          >
            {translate("preparing")}
          </h1>
          <span className="text-sm tabular-nums text-white/40">
            {layoutMode === "cards"
              ? orderCards.length
              : preparingRows.filter((row) => row.kind === "item").length}
          </span>
        </header>

        <div className="relative min-h-0 flex-1">
          <div data-server-scroll className="absolute inset-0 overflow-y-auto overscroll-contain">
            {layoutMode === "cards" ? (
              <ServerScreenOrderCards
                cards={orderCards}
                nowMs={nowMs}
                minLabel={minLabel}
                selectedKeys={selectedKeys}
                animatingOut={animatingOut}
                emptyLabel={translate("noOrders")}
                onToggleLine={toggleCardLine}
                onSetLineCount={setCardLineSelectedCount}
              />
            ) : preparingRows.length === 0 ? (
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
                        className={`flex w-full flex-nowrap items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 ${prepRowClass(
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
                          className={`shrink-0 whitespace-nowrap text-sm tabular-nums sm:text-[0.95rem] ${
                            selected ? "text-zinc-800/75" : "text-white/45"
                          }`}
                        >
                          {formatPreparationMinutes(row.item.createdAt, nowMs, minLabel)}
                        </span>
                        <span
                          className={`shrink-0 whitespace-nowrap text-right text-base font-bold tabular-nums sm:text-lg ${
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

          <ServerScreenReservationPanel
            open={reservationsOpen}
            onClose={() => setReservationsOpen(false)}
            language={language}
            title={translate("prepStatsReservationsTitle")}
            emptyLabel={translate("prepStatsReservationsEmpty")}
          />

          <ServerScreenPrepStatsPanel
            stats={prepStats}
            loading={prepStatsLoading}
            open={prepStatsOpen}
            onClose={() => setPrepStatsOpen(false)}
            title={translate("prepStatsTodayTitle")}
            averageLabel={translate("prepStatsAverage")}
            fastestLabel={translate("prepStatsFastest")}
            slowestLabel={translate("prepStatsSlowest")}
            fastestItemsLabel={translate("prepStatsFastestItems")}
            slowestItemsLabel={translate("prepStatsSlowestItems")}
            emptyLabel={translate("prepStatsNoData")}
            sampleCountLabel={translate("prepStatsSampleCount")}
            minLabel={minLabel}
          />
        </div>
      </section>

      <FloatingToolbar
        selectedCount={selectedCount}
        busy={busy}
        refreshing={refreshing}
        onMarkDone={() => void handleMarkDone()}
        onHistory={() => setHistoryOpen(true)}
        onLayout={toggleLayoutMode}
        onRefresh={() => void handleRefresh()}
        onPrepStats={openPrepStats}
        markDoneLabel={translate("serverScreenMarkDone")}
        historyLabel={translate("history")}
        layoutLabel={translate("serverScreenLayout")}
        refreshLabel={translate("serverScreenRefresh")}
        prepStatsLabel={translate("prepStatsTodayTitle")}
        showPrepStats
        layoutActive={layoutMode === "cards"}
      />
      <ServerScreenFooter language={language} />
    </div>,
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
