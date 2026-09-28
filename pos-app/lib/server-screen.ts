import {
  isGrillGuestPrepOrder,
  isGrillMenuItem,
} from "@/lib/grill-guest-count";
import { resolveKitchenStatus } from "@/lib/auto-serve";
import { resolveMenuItemForOrder } from "@/lib/menu-display";
import type {
  LanguageCode,
  MenuItem,
  OrderItem,
  ServerScreenConfig,
  ServerScreenLanguageMode,
} from "@/lib/types";

/** Ready column keeps items visible this long after mark-ready (display only). */
export const SERVER_SCREEN_READY_VISIBLE_MS = 5 * 60 * 1000;

/** Auto language rotation interval. */
export const SERVER_SCREEN_LANG_ROTATE_MS = 10_000;

export type { ServerScreenConfig, ServerScreenLanguageMode };

export const DEFAULT_SERVER_SCREEN_CONFIG: ServerScreenConfig = {
  languageMode: "bilingual",
  languages: ["en", "cs"],
  autoRotateLanguage: true,
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
  };
}

export function serverScreenConfigToDb(config: ServerScreenConfig) {
  const languages = normalizeServerScreenLanguages(config.languageMode, config.languages);
  return {
    languageMode: config.languageMode,
    languages,
    autoRotateLanguage: Boolean(config.autoRotateLanguage),
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
    names: { en: "Lettuce, garlic", cs: "Salát, česnek", zh: "生菜、大蒜" },
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

function orderIsGrillDish(order: OrderItem, menuItems: MenuItem[]): boolean {
  if (isGrillGuestPrepOrder(order)) return false;
  const menu = resolveMenuItemForOrder(order, menuItems);
  if (menu) return isGrillMenuItem(menu);
  const name = order.name.toLowerCase();
  return (
    name.includes("grill set") ||
    name.includes("busan") ||
    name.includes("seoul set") ||
    name.includes("grilovací set")
  );
}

/**
 * Earliest grill dish id for a table among all known session items.
 * Companions attach only to this first grill order.
 */
export function firstGrillOrderItemId(
  tableItems: OrderItem[],
  menuItems: MenuItem[],
): string | null {
  let earliest: OrderItem | null = null;
  for (const item of tableItems) {
    if (!item.id || !orderIsGrillDish(item, menuItems)) continue;
    if (!earliest) {
      earliest = item;
      continue;
    }
    const a = item.createdAt ?? "";
    const b = earliest.createdAt ?? "";
    if (a && (!b || a < b)) earliest = item;
  }
  return earliest?.id ?? null;
}

export function shouldShowGrillCompanions(
  item: OrderItem,
  tableItems: OrderItem[],
  menuItems: MenuItem[],
): boolean {
  if (!item.id || !orderIsGrillDish(item, menuItems)) return false;
  return firstGrillOrderItemId(tableItems, menuItems) === item.id;
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
  companionDone: Record<string, string>;
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

/**
 * Group station items into kitchen order cards (one Send / wave per card).
 * Pending + recently-done lines stay together until the whole card is complete.
 */
export function buildServerScreenOrderCards(
  input: BuildOrderCardsInput,
): ServerScreenOrderCard[] {
  const {
    items,
    menuItems,
    tableLabelById,
    language,
    companionDone,
    resolveName,
    resolveNote,
  } = input;

  const byTable = new Map<string, typeof items>();
  for (const item of items) {
    if (item.hideOnKds || item.isCancelled || item.kitchenStatus === "cancelled") continue;
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
    if (!item.id || item.hideOnKds || item.isCancelled || item.kitchenStatus === "cancelled") {
      continue;
    }
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

  const cards: ServerScreenOrderCard[] = [];

  for (const [waveId, wave] of waves) {
    const pendingItems = wave.items.filter((item) => isPreparingColumnVisible(item));

    const tableSession = byTable.get(wave.tableId) ?? [];
    const companionLines: ServerScreenOrderCardLine[] = [];
    let pendingCompanions = 0;

    for (const item of pendingItems) {
      if (!shouldShowGrillCompanions(item, tableSession, menuItems)) continue;
      for (const companion of GRILL_FIRST_ORDER_COMPANIONS) {
        const companionKey = `${item.id}::${companion.id}`;
        const doneAt = companionDone[companionKey];
        if (!doneAt) pendingCompanions += 1;
        companionLines.push({
          key: companionKey,
          kind: "companion",
          name: companion.names[language] || companion.names.en,
          note: null,
          remainingIds: doneAt ? [] : [companionKey],
          doneCount: doneAt ? 1 : 0,
          companionKey,
          parentItemId: item.id,
        });
      }
    }

    // Also show done companions whose parent grill is in this wave (ready or pending).
    for (const item of wave.items) {
      if (!item.id || !shouldShowGrillCompanions(item, tableSession, menuItems)) continue;
      if (pendingItems.some((row) => row.id === item.id)) continue;
      for (const companion of GRILL_FIRST_ORDER_COMPANIONS) {
        const companionKey = `${item.id}::${companion.id}`;
        const doneAt = companionDone[companionKey];
        if (!doneAt) {
          pendingCompanions += 1;
          companionLines.push({
            key: companionKey,
            kind: "companion",
            name: companion.names[language] || companion.names.en,
            note: null,
            remainingIds: [companionKey],
            doneCount: 0,
            companionKey,
            parentItemId: item.id,
          });
          continue;
        }
        if (!companionLines.some((line) => line.key === companionKey)) {
          companionLines.push({
            key: companionKey,
            kind: "companion",
            name: companion.names[language] || companion.names.en,
            note: null,
            remainingIds: [],
            doneCount: 1,
            companionKey,
            parentItemId: item.id,
          });
        }
      }
    }

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
          doneCount: 0,
        };
        lineMap.set(key, line);
        lineOrder.push(key);
      }
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

    const itemLines = lineOrder
      .map((key) => lineMap.get(key)!)
      .filter(Boolean);

    const ageFrom =
      pendingItems
        .map((item) => item.createdAt)
        .filter((value): value is string => Boolean(value))
        .sort()[0] ?? wave.orderedAt;

    cards.push({
      id: waveId,
      tableId: wave.tableId,
      tableLabel: tableLabelById.get(wave.tableId) ?? "—",
      ticketId: formatServerScreenTicketId(wave.orderedAt),
      orderedAt: wave.orderedAt,
      ageFrom,
      lines: [...itemLines, ...companionLines],
      hasPending: true,
    });
  }

  // Newest appends at the end — stable by order creation time.
  return cards.sort((a, b) => {
    if (a.orderedAt !== b.orderedAt) return a.orderedAt < b.orderedAt ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}
