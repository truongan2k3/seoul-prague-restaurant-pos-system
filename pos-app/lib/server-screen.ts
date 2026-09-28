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
