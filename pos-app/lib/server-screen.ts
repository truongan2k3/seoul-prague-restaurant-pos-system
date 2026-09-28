import {
  isGrillGuestPrepOrder,
  isGrillMenuItem,
  isGrillSetMenuItem,
} from "@/lib/grill-guest-count";
import { resolveKitchenStatus } from "@/lib/auto-serve";
import { resolveMenuItemForOrder } from "@/lib/menu-display";
import { normalizeOrderItemStatus } from "@/lib/order-status";
import type {
  LanguageCode,
  MenuItem,
  OrderItem,
  ServerScreenConfig,
  ServerScreenLanguageMode,
} from "@/lib/types";

/** Ready column keeps items visible this long after mark-ready (display only). */
export const SERVER_SCREEN_READY_VISIBLE_MS = 5 * 60 * 1000;

/** Server Screen History keeps completed orders this long. */
export const SERVER_SCREEN_HISTORY_VISIBLE_MS = 2 * 60 * 60 * 1000;

/** Auto language rotation interval. */
export const SERVER_SCREEN_LANG_ROTATE_MS = 10_000;

export type { ServerScreenConfig, ServerScreenLanguageMode };

export const DEFAULT_SERVER_SCREEN_CONFIG: ServerScreenConfig = {
  languageMode: "bilingual",
  languages: ["en", "cs"],
  autoRotateLanguage: true,
  showPaymentOverlayOnKds: false,
};

const LANG_SET = new Set<LanguageCode>(["en", "cs", "zh"]);

function asLanguage(value: unknown): LanguageCode | null {
  return typeof value === "string" && LANG_SET.has(value as LanguageCode)
    ? (value as LanguageCode)
    : null;
}

export function normalizeServerScreenLanguages(
  mode: ServerScreenLanguageMode,
  languages: LanguageCode[],
): LanguageCode[] {
  const unique: LanguageCode[] = [];
  for (const lang of languages) {
    if (!LANG_SET.has(lang) || unique.includes(lang)) continue;
    unique.push(lang);
  }
  if (unique.length === 0) unique.push("en");

  if (mode === "single") return [unique[0]!];
  if (mode === "bilingual") return unique.slice(0, 2);
  return unique;
}

export function parseServerScreenConfig(raw: unknown): ServerScreenConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SERVER_SCREEN_CONFIG, languages: ["en"] };
  const row = raw as Record<string, unknown>;
  const modeRaw = row.languageMode ?? row.language_mode;
  const languageMode: ServerScreenLanguageMode =
    modeRaw === "bilingual" || modeRaw === "multilingual" || modeRaw === "single"
      ? modeRaw
      : DEFAULT_SERVER_SCREEN_CONFIG.languageMode;

  const listRaw = row.languages;
  const parsed: LanguageCode[] = [];
  if (Array.isArray(listRaw)) {
    for (const entry of listRaw) {
      const lang = asLanguage(entry);
      if (lang) parsed.push(lang);
    }
  }

  return {
    languageMode,
    languages: normalizeServerScreenLanguages(languageMode, parsed),
    autoRotateLanguage:
      typeof row.autoRotateLanguage === "boolean"
        ? row.autoRotateLanguage
        : typeof row.auto_rotate_language === "boolean"
          ? row.auto_rotate_language
          : DEFAULT_SERVER_SCREEN_CONFIG.autoRotateLanguage,
    showPaymentOverlayOnKds:
      typeof row.showPaymentOverlayOnKds === "boolean"
        ? row.showPaymentOverlayOnKds
        : typeof row.show_payment_overlay_on_kds === "boolean"
          ? row.show_payment_overlay_on_kds
          : DEFAULT_SERVER_SCREEN_CONFIG.showPaymentOverlayOnKds,
  };
}

export function serverScreenConfigToDb(config: ServerScreenConfig) {
  const languages = normalizeServerScreenLanguages(config.languageMode, config.languages);
  return {
    languageMode: config.languageMode,
    languages,
    autoRotateLanguage: Boolean(config.autoRotateLanguage),
    showPaymentOverlayOnKds: Boolean(config.showPaymentOverlayOnKds),
  };
}

/** Preparation elapsed label: &lt;1 min, 1 min, 2 min, … (no seconds). */
export function formatPreparationMinutes(
  createdAt: string | Date | null | undefined,
  nowMs = Date.now(),
  minLabel = "min",
): string {
  if (!createdAt) return `<1 ${minLabel}`;
  const start = typeof createdAt === "string" ? new Date(createdAt).getTime() : createdAt.getTime();
  if (Number.isNaN(start)) return `<1 ${minLabel}`;
  const minutes = Math.floor(Math.max(0, nowMs - start) / 60_000);
  if (minutes < 1) return `<1 ${minLabel}`;
  return `${minutes} ${minLabel}`;
}

export function preparationAgeMinutes(
  createdAt: string | Date | null | undefined,
  nowMs = Date.now(),
): number {
  if (!createdAt) return 0;
  const start = typeof createdAt === "string" ? new Date(createdAt).getTime() : createdAt.getTime();
  if (Number.isNaN(start)) return 0;
  return Math.floor(Math.max(0, nowMs - start) / 60_000);
}

export type PrepHighlightTone = "normal" | "warn" | "critical";

export function preparationHighlightTone(ageMinutes: number): PrepHighlightTone {
  if (ageMinutes > 20) return "critical";
  if (ageMinutes > 10) return "warn";
  return "normal";
}

export function isReadyColumnVisible(
  item: Pick<OrderItem, "kitchenStatus" | "status" | "readyAt" | "isCancelled" | "hideOnKds">,
  nowMs = Date.now(),
): boolean {
  if (item.hideOnKds || item.isCancelled || item.kitchenStatus === "cancelled") return false;
  if (!item.readyAt) return false;
  const readyMs = new Date(item.readyAt).getTime();
  if (Number.isNaN(readyMs)) return false;
  if (nowMs - readyMs > SERVER_SCREEN_READY_VISIBLE_MS) return false;
  const status = item.kitchenStatus;
  return status === "ready" || status === "served";
}

export function isPreparingColumnVisible(
  item: Pick<OrderItem, "kitchenStatus" | "status" | "isCancelled" | "hideOnKds">,
): boolean {
  if (item.hideOnKds) return false;
  if (item.isCancelled || item.kitchenStatus === "cancelled" || item.kitchenStatus === "archived") {
    return false;
  }
  // Explicit completed kitchen lane — hide from Preparing.
  if (item.kitchenStatus === "ready" || item.kitchenStatus === "served") return false;

  // Missing/corrupt kitchen_status: fall back to order status so preparing
  // rows never silently vanish from KDS/Bar.
  if (!item.kitchenStatus) {
    const status = normalizeOrderItemStatus(item.status);
    return status !== "ready" && status !== "served";
  }

  return resolveKitchenStatus(item) === "pending";
}

/** First-grill companion lines shown only once per table session. */
export const GRILL_FIRST_ORDER_COMPANIONS: Array<{
  id: string;
  names: Record<LanguageCode, string>;
}> = [
  {
    id: "banchan",
    names: { en: "Banchan", cs: "Banchan", zh: "小菜" },
  },
  {
    id: "lettuce",
    names: { en: "Lettuce", cs: "Salát", zh: "生菜" },
  },
  {
    id: "garlic",
    names: { en: "Garlic", cs: "Česnek", zh: "大蒜" },
  },
  {
    id: "leek",
    names: { en: "Leek salad", cs: "Pórkový salát", zh: "葱沙拉" },
  },
  {
    id: "charcoal",
    names: { en: "Charcoal", cs: "Dřevěné uhlí", zh: "木炭" },
  },
];

function orderIsGrillSetDish(order: OrderItem, menuItems: MenuItem[]): boolean {
  if (isGrillGuestPrepOrder(order)) return false;
  const menu = resolveMenuItemForOrder(order, menuItems);
  if (menu) return isGrillSetMenuItem(menu);
  const name = order.name.toLowerCase();
  return (
    name.includes("grill set") ||
    name.includes("busan") ||
    name.includes("seoul set") ||
    name.includes("grilovací set") ||
    name.includes("grilovaci set")
  );
}

function orderIsGrillDish(order: OrderItem, menuItems: MenuItem[]): boolean {
  if (isGrillGuestPrepOrder(order)) return false;
  const menu = resolveMenuItemForOrder(order, menuItems);
  if (menu) return isGrillMenuItem(menu);
  return orderIsGrillSetDish(order, menuItems);
}

/**
 * Earliest grill dish id for a table among all known session items.
 * Companions attach to the first Grill Set when present; otherwise first BBQ grill.
 */
export function firstGrillOrderItemId(
  tableItems: OrderItem[],
  menuItems: MenuItem[],
): string | null {
  let earliestSet: OrderItem | null = null;
  let earliestAny: OrderItem | null = null;
  for (const item of tableItems) {
    if (!item.id) continue;
    if (orderIsGrillSetDish(item, menuItems)) {
      if (
        !earliestSet ||
        (item.createdAt && (!earliestSet.createdAt || item.createdAt < earliestSet.createdAt))
      ) {
        earliestSet = item;
      }
    }
    if (orderIsGrillDish(item, menuItems)) {
      if (
        !earliestAny ||
        (item.createdAt && (!earliestAny.createdAt || item.createdAt < earliestAny.createdAt))
      ) {
        earliestAny = item;
      }
    }
  }
  return earliestSet?.id ?? earliestAny?.id ?? null;
}

export function shouldShowGrillCompanions(
  item: OrderItem,
  tableItems: OrderItem[],
  menuItems: MenuItem[],
): boolean {
  if (!item.id || !orderIsGrillDish(item, menuItems)) return false;
  return firstGrillOrderItemId(tableItems, menuItems) === item.id;
}

/** Persisted first-grill anchor so companions survive grill done/cancel/delete. */
export type GrillCompanionAnchor = {
  parentId: string;
  tableId: string;
  createdAt: string;
};

/** Bump when companion id set changes (e.g. split lettuce/garlic). */
export const GRILL_COMPANION_STORE_VERSION = 2;

export type GrillCompanionStore = {
  version?: number;
  done: Record<string, string>;
  anchors: Record<string, GrillCompanionAnchor>;
};

export function emptyGrillCompanionStore(): GrillCompanionStore {
  return { version: GRILL_COMPANION_STORE_VERSION, done: {}, anchors: {} };
}

/**
 * v1 used a single "lettuce" row meaning Lettuce+Garlic.
 * On upgrade, copy done state to the new "garlic" id once.
 */
export function migrateGrillCompanionStore(store: GrillCompanionStore): GrillCompanionStore {
  if ((store.version ?? 1) >= GRILL_COMPANION_STORE_VERSION) {
    return store.version ? store : { ...store, version: GRILL_COMPANION_STORE_VERSION };
  }
  const done = { ...store.done };
  for (const [key, readyAt] of Object.entries(store.done)) {
    if (!key.endsWith("::lettuce")) continue;
    const garlicKey = `${key.slice(0, -"::lettuce".length)}::garlic`;
    if (!(garlicKey in done)) done[garlicKey] = readyAt;
  }
  return {
    version: GRILL_COMPANION_STORE_VERSION,
    done,
    anchors: store.anchors ?? {},
  };
}

export function companionKeyFor(parentId: string, companionId: string): string {
  return `${parentId}::${companionId}`;
}

export function isCompanionPending(
  store: GrillCompanionStore,
  parentId: string,
  companionId: string,
): boolean {
  return !store.done[companionKeyFor(parentId, companionId)];
}

export function pendingCompanionIds(
  store: GrillCompanionStore,
  parentId: string,
): string[] {
  return GRILL_FIRST_ORDER_COMPANIONS.filter((row) =>
    isCompanionPending(store, parentId, row.id),
  ).map((row) => row.id);
}

/**
 * Remember first-grill anchors from live items. Never clears an existing
 * table anchor just because the grill left preparing / was cancelled.
 */
export function mergeGrillCompanionAnchors(
  store: GrillCompanionStore,
  tableItemsByTable: Map<string, OrderItem[]>,
  menuItems: MenuItem[],
): GrillCompanionStore {
  let changed = false;
  const anchors = { ...store.anchors };

  for (const [tableId, tableItems] of tableItemsByTable) {
    if (anchors[tableId]) continue;
    const firstId = firstGrillOrderItemId(tableItems, menuItems);
    if (!firstId) continue;
    const parent = tableItems.find((item) => item.id === firstId);
    if (!parent?.id) continue;
    anchors[tableId] = {
      parentId: parent.id,
      tableId,
      createdAt: parent.createdAt ?? new Date().toISOString(),
    };
    changed = true;
  }

  return changed
    ? { ...store, version: store.version ?? GRILL_COMPANION_STORE_VERSION, anchors }
    : store;
}

/** Drop anchors only when every companion is done and aged out of history. */
export function pruneGrillCompanionStore(
  store: GrillCompanionStore,
  nowMs = Date.now(),
): GrillCompanionStore {
  const done: Record<string, string> = {};
  let changed = false;

  for (const [key, readyAt] of Object.entries(store.done)) {
    const readyMs = new Date(readyAt).getTime();
    if (Number.isNaN(readyMs) || nowMs - readyMs > SERVER_SCREEN_HISTORY_VISIBLE_MS) {
      changed = true;
      continue;
    }
    done[key] = readyAt;
  }

  const anchors: Record<string, GrillCompanionAnchor> = {};
  for (const [tableId, anchor] of Object.entries(store.anchors)) {
    const pending = pendingCompanionIds({ done, anchors: store.anchors }, anchor.parentId);
    if (pending.length > 0) {
      anchors[tableId] = anchor;
      continue;
    }
    // All companions done — keep anchor until the newest companion ages out of history.
    let newestDone = 0;
    for (const companion of GRILL_FIRST_ORDER_COMPANIONS) {
      const readyAt = done[companionKeyFor(anchor.parentId, companion.id)];
      if (!readyAt) continue;
      const ms = new Date(readyAt).getTime();
      if (!Number.isNaN(ms)) newestDone = Math.max(newestDone, ms);
    }
    if (newestDone > 0 && nowMs - newestDone <= SERVER_SCREEN_HISTORY_VISIBLE_MS) {
      anchors[tableId] = anchor;
    } else {
      changed = true;
    }
  }

  if (!changed && Object.keys(done).length === Object.keys(store.done).length) {
    if (Object.keys(anchors).length === Object.keys(store.anchors).length) return store;
  }
  return { version: store.version ?? GRILL_COMPANION_STORE_VERSION, done, anchors };
}

export function historyWithinRetention(
  completedAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!completedAt) return false;
  const ms = new Date(completedAt).getTime();
  if (Number.isNaN(ms)) return false;
  return nowMs - ms <= SERVER_SCREEN_HISTORY_VISIBLE_MS;
}

export function formatReadyClock(
  readyAt: string | Date | null | undefined,
  language: LanguageCode,
): string {
  if (!readyAt) return "";
  const date = typeof readyAt === "string" ? new Date(readyAt) : readyAt;
  if (Number.isNaN(date.getTime())) return "";
  const locale = language === "cs" ? "cs-CZ" : language === "zh" ? "zh-CN" : "en-GB";
  return date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatServerScreenFooterDate(now: Date, language: LanguageCode): string {
  const locale = language === "cs" ? "cs-CZ" : language === "zh" ? "zh-CN" : "en-US";
  return now.toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatServerScreenFooterTime(now: Date, language: LanguageCode): string {
  const locale = language === "cs" ? "cs-CZ" : language === "zh" ? "zh-CN" : "en-GB";
  return now.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function nextServerScreenLanguage(
  current: LanguageCode,
  languages: LanguageCode[],
): LanguageCode {
  const list = languages.length > 0 ? languages : (["en"] as LanguageCode[]);
  const index = list.indexOf(current);
  if (index < 0) return list[0]!;
  return list[(index + 1) % list.length]!;
}

/** Server Screen visual layout — list (default) or kitchen order cards. */
export type ServerScreenLayoutMode = "list" | "cards";

const LAYOUT_STORAGE_KEY = "pos-server-screen-layout-mode";

export function readServerScreenLayoutMode(): ServerScreenLayoutMode {
  if (typeof window === "undefined") return "list";
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    return raw === "cards" ? "cards" : "list";
  } catch {
    return "list";
  }
}

export function writeServerScreenLayoutMode(mode: ServerScreenLayoutMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, mode);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Same-minute send wave so one Send → one order card. */
export function serverScreenOrderWaveKey(
  tableId: string,
  createdAt: string | null | undefined,
): string {
  const bucket = createdAt ? createdAt.slice(0, 16) : "";
  return `${tableId}|${bucket}`;
}

/** Compact ticket number from creation time (display only). */
export function formatServerScreenTicketId(
  createdAt: string | Date | null | undefined,
): string {
  if (!createdAt) return "---";
  const date = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  if (Number.isNaN(date.getTime())) return "---";
  return String(Math.floor(date.getTime() / 1000) % 1000).padStart(3, "0");
}

export type ServerScreenOrderCardLineKind = "item" | "companion";

export type ServerScreenOrderCardLine = {
  key: string;
  kind: ServerScreenOrderCardLineKind;
  name: string;
  note: string | null;
  /** Pending unit ids still needing prep (remaining quantity). */
  remainingIds: string[];
  /** All unit ids represented by this line (pending + done). */
  unitIds: string[];
  /** Ready/served units kept visible until the whole card completes. */
  doneCount: number;
  companionKey?: string;
  parentItemId?: string;
};

export type ServerScreenOrderCard = {
  id: string;
  tableId: string;
  tableLabel: string;
  ticketId: string;
  orderedAt: string;
  /** Age / highlight from earliest pending (or order) timestamp. */
  ageFrom: string;
  lines: ServerScreenOrderCardLine[];
  /** True while any remaining prep work exists on this card. */
  hasPending: boolean;
};

type BuildOrderCardsInput = {
  items: Array<
    OrderItem & {
      tableId: string;
      createdAt?: string;
      readyAt?: string;
    }
  >;
  menuItems: MenuItem[];
  tableLabelById: Map<string, string>;
  language: LanguageCode;
  companionStore: GrillCompanionStore;
  resolveName: (item: OrderItem) => string;
  resolveNote: (item: OrderItem) => string | null;
};

function lineAggregateKey(item: OrderItem): string {
  return [
    item.menuItemId ?? "",
    item.name,
    item.notes ?? "",
    item.notesTranslated ?? "",
    item.station ?? "",
  ].join("\u0001");
}

function buildCompanionLinesForParent(
  parentId: string,
  language: LanguageCode,
  companionStore: GrillCompanionStore,
): { lines: ServerScreenOrderCardLine[]; pendingCount: number } {
  const lines: ServerScreenOrderCardLine[] = [];
  let pendingCount = 0;
  for (const companion of GRILL_FIRST_ORDER_COMPANIONS) {
    const key = companionKeyFor(parentId, companion.id);
    const doneAt = companionStore.done[key];
    if (!doneAt) pendingCount += 1;
    lines.push({
      key,
      kind: "companion",
      name: companion.names[language] || companion.names.en,
      note: null,
      remainingIds: doneAt ? [] : [key],
      unitIds: [key],
      doneCount: doneAt ? 1 : 0,
      companionKey: key,
      parentItemId: parentId,
    });
  }
  return { lines, pendingCount };
}

/**
 * Group station items into kitchen order cards (one Send / wave per card).
 * Pending + recently-done lines stay together until the whole card is complete.
 * Grill companions stay until marked done — even if the grill item is done/cancelled/removed.
 */
export function buildServerScreenOrderCards(
  input: BuildOrderCardsInput,
): ServerScreenOrderCard[] {
  const {
    items,
    menuItems,
    tableLabelById,
    language,
    companionStore,
    resolveName,
    resolveNote,
  } = input;

  const byTable = new Map<string, typeof items>();
  for (const item of items) {
    // Keep cancelled grill rows in session lookup so companion anchors can resolve names/times.
    if (item.hideOnKds) continue;
    const list = byTable.get(item.tableId) ?? [];
    list.push(item);
    byTable.set(item.tableId, list);
  }

  type WaveBucket = {
    tableId: string;
    orderedAt: string;
    items: typeof items;
  };

  const waves = new Map<string, WaveBucket>();
  for (const item of items) {
    if (!item.id || item.hideOnKds) continue;
    if (item.isCancelled || item.kitchenStatus === "cancelled") continue;
    const status = resolveKitchenStatus(item);
    if (status !== "pending" && status !== "ready" && status !== "served") continue;

    const waveId = serverScreenOrderWaveKey(item.tableId, item.createdAt);
    const existing = waves.get(waveId);
    if (!existing) {
      waves.set(waveId, {
        tableId: item.tableId,
        orderedAt: item.createdAt ?? "",
        items: [item],
      });
      continue;
    }
    existing.items.push(item);
    if (item.createdAt && (!existing.orderedAt || item.createdAt < existing.orderedAt)) {
      existing.orderedAt = item.createdAt;
    }
  }

  // Ensure companion-only cards exist when the grill wave was cancelled/removed.
  for (const anchor of Object.values(companionStore.anchors)) {
    const pending = pendingCompanionIds(companionStore, anchor.parentId);
    if (pending.length === 0) continue;
    const waveId = serverScreenOrderWaveKey(anchor.tableId, anchor.createdAt);
    if (waves.has(waveId)) continue;
    waves.set(waveId, {
      tableId: anchor.tableId,
      orderedAt: anchor.createdAt,
      items: [],
    });
  }

  const cards: ServerScreenOrderCard[] = [];
  const companionsAttached = new Set<string>();

  for (const [waveId, wave] of waves) {
    const pendingItems = wave.items.filter((item) => isPreparingColumnVisible(item));
    const tableSession = byTable.get(wave.tableId) ?? [];
    const anchor = companionStore.anchors[wave.tableId];

    let companionLines: ServerScreenOrderCardLine[] = [];
    let pendingCompanions = 0;

    const attachCompanionsForParent = (parentId: string) => {
      if (companionsAttached.has(parentId)) return;
      const built = buildCompanionLinesForParent(parentId, language, companionStore);
      companionLines = built.lines;
      pendingCompanions = built.pendingCount;
      companionsAttached.add(parentId);
    };

    // Prefer live first-grill in this wave; fall back to persisted table anchor.
    let companionParentId: string | null = null;
    for (const item of wave.items) {
      if (shouldShowGrillCompanions(item, tableSession, menuItems)) {
        companionParentId = item.id ?? null;
        break;
      }
    }
    if (
      !companionParentId &&
      anchor &&
      serverScreenOrderWaveKey(anchor.tableId, anchor.createdAt) === waveId
    ) {
      companionParentId = anchor.parentId;
    }
    // Also attach when anchor's parent appears in this wave (ready/served/cancelled gone but wave has other items)
    if (!companionParentId && anchor) {
      const parentInWave = wave.items.some((item) => item.id === anchor.parentId);
      if (parentInWave) companionParentId = anchor.parentId;
    }

    if (companionParentId) attachCompanionsForParent(companionParentId);

    const hasPending = pendingItems.length > 0 || pendingCompanions > 0;
    if (!hasPending) continue;

    const lineMap = new Map<string, ServerScreenOrderCardLine>();
    const lineOrder: string[] = [];
    const ensureLine = (item: (typeof items)[number], pending: boolean) => {
      const agg = lineAggregateKey(item);
      const key = `item:${waveId}:${agg}`;
      let line = lineMap.get(key);
      if (!line) {
        line = {
          key,
          kind: "item",
          name: resolveName(item),
          note: resolveNote(item),
          remainingIds: [],
          unitIds: [],
          doneCount: 0,
        };
        lineMap.set(key, line);
        lineOrder.push(key);
      }
      if (item.id) line.unitIds.push(item.id);
      if (pending && item.id) line.remainingIds.push(item.id);
      else if (!pending) line.doneCount += 1;
    };

    const waveSorted = wave.items.slice().sort((a, b) => {
      const at = a.createdAt ?? "";
      const bt = b.createdAt ?? "";
      if (at !== bt) return at < bt ? -1 : 1;
      return (a.id ?? "").localeCompare(b.id ?? "");
    });
    for (const item of waveSorted) {
      if (isPreparingColumnVisible(item)) ensureLine(item, true);
      else {
        const status = resolveKitchenStatus(item);
        if (status === "ready" || status === "served") ensureLine(item, false);
      }
    }

    const itemLines = lineOrder.map((key) => lineMap.get(key)!).filter(Boolean);
    const lines: ServerScreenOrderCardLine[] = [];
    let companionsPlaced = false;
    for (const line of itemLines) {
      lines.push(line);
      if (
        companionParentId &&
        !companionsPlaced &&
        line.unitIds.includes(companionParentId)
      ) {
        lines.push(...companionLines);
        companionsPlaced = true;
      }
    }
    if (!companionsPlaced && companionLines.length > 0) {
      // Grill set missing from wave (done/cancelled) — keep companions on this card.
      lines.push(...companionLines);
    }

    const ageFrom =
      pendingItems
        .map((item) => item.createdAt)
        .filter((value): value is string => Boolean(value))
        .sort()[0] ??
      (companionParentId && pendingCompanions > 0
        ? companionStore.anchors[wave.tableId]?.createdAt
        : undefined) ??
      wave.orderedAt;

    cards.push({
      id: waveId,
      tableId: wave.tableId,
      tableLabel: tableLabelById.get(wave.tableId) ?? "—",
      ticketId: formatServerScreenTicketId(wave.orderedAt),
      orderedAt: wave.orderedAt,
      ageFrom,
      lines,
      hasPending: true,
    });
  }

  // Newest appends at the end — stable by order creation time.
  return cards.sort((a, b) => {
    if (a.orderedAt !== b.orderedAt) return a.orderedAt < b.orderedAt ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}
