import { receiptFontStack } from "@/lib/receipt-print-styles";
import type { AppSettings, MarqueeConfigs, MarqueeSurfaceConfig, ReceiptFontFamily } from "@/lib/types";

export const MARQUEE_SPEED_MIN = 8;
export const MARQUEE_SPEED_MAX = 120;
export const MARQUEE_SPEED_DEFAULT = 28;

export const MARQUEE_SURFACES = ["pos", "client", "kds", "bar"] as const;
export type MarqueeSurface = (typeof MARQUEE_SURFACES)[number];

export function clampMarqueeDurationSeconds(value: number): number {
  if (!Number.isFinite(value)) return MARQUEE_SPEED_DEFAULT;
  return Math.min(MARQUEE_SPEED_MAX, Math.max(MARQUEE_SPEED_MIN, Math.round(value)));
}

export function parseMarqueeFontFamily(value: string | null | undefined): ReceiptFontFamily {
  const allowed: ReceiptFontFamily[] = ["consolas", "courier", "arial", "tahoma", "lucida", "georgia"];
  return allowed.includes(value as ReceiptFontFamily) ? (value as ReceiptFontFamily) : "arial";
}

export function defaultMarqueeSurfaceConfig(
  overrides: Partial<MarqueeSurfaceConfig> = {},
): MarqueeSurfaceConfig {
  return {
    enabled: false,
    messages: [""],
    durationSeconds: MARQUEE_SPEED_DEFAULT,
    fontFamily: "arial",
    endAt: "",
    ...overrides,
  };
}

export function defaultMarqueeConfigs(): MarqueeConfigs {
  return {
    pos: defaultMarqueeSurfaceConfig({ enabled: false }),
    client: defaultMarqueeSurfaceConfig(),
    kds: defaultMarqueeSurfaceConfig(),
    bar: defaultMarqueeSurfaceConfig(),
  };
}

function normalizeMessages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [""];
  const messages = raw
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
  return messages.length > 0 ? messages : [""];
}

function normalizeSurfaceConfig(raw: unknown): MarqueeSurfaceConfig {
  if (!raw || typeof raw !== "object") return defaultMarqueeSurfaceConfig();
  const row = raw as Record<string, unknown>;
  return {
    enabled: Boolean(row.enabled),
    messages: normalizeMessages(row.messages),
    durationSeconds: clampMarqueeDurationSeconds(Number(row.durationSeconds ?? MARQUEE_SPEED_DEFAULT)),
    fontFamily: parseMarqueeFontFamily(
      typeof row.fontFamily === "string" ? row.fontFamily : undefined,
    ),
    endAt: typeof row.endAt === "string" ? row.endAt : "",
  };
}

/** Build per-surface configs from JSON or legacy global marquee columns. */
export function resolveMarqueeConfigs(settings: {
  marqueeConfigs?: MarqueeConfigs;
  marqueeEnabled: boolean;
  marqueeText: string;
  marqueeDurationSeconds: number;
  marqueeFontFamily: ReceiptFontFamily;
  marqueeEndAt: string;
  marqueeOnPos: boolean;
  marqueeOnClient: boolean;
  marqueeOnKds: boolean;
  marqueeOnBar: boolean;
}): MarqueeConfigs {
  if (settings.marqueeConfigs) {
    const base = defaultMarqueeConfigs();
    return {
      pos: normalizeSurfaceConfig(settings.marqueeConfigs.pos ?? base.pos),
      client: normalizeSurfaceConfig(settings.marqueeConfigs.client ?? base.client),
      kds: normalizeSurfaceConfig(settings.marqueeConfigs.kds ?? base.kds),
      bar: normalizeSurfaceConfig(settings.marqueeConfigs.bar ?? base.bar),
    };
  }

  const legacyMessages = settings.marqueeText.trim() ? [settings.marqueeText.trim()] : [""];
  const shared = {
    enabled: settings.marqueeEnabled,
    messages: legacyMessages,
    durationSeconds: clampMarqueeDurationSeconds(settings.marqueeDurationSeconds),
    fontFamily: settings.marqueeFontFamily,
    endAt: settings.marqueeEndAt,
  };

  return {
    pos: defaultMarqueeSurfaceConfig({
      ...shared,
      enabled: settings.marqueeEnabled && settings.marqueeOnPos,
    }),
    client: defaultMarqueeSurfaceConfig({
      ...shared,
      enabled: settings.marqueeEnabled && settings.marqueeOnClient,
    }),
    kds: defaultMarqueeSurfaceConfig({
      ...shared,
      enabled: settings.marqueeEnabled && settings.marqueeOnKds,
    }),
    bar: defaultMarqueeSurfaceConfig({
      ...shared,
      enabled: settings.marqueeEnabled && settings.marqueeOnBar,
    }),
  };
}

export function getMarqueeSurfaceConfig(
  settings: AppSettings,
  surface: MarqueeSurface,
): MarqueeSurfaceConfig {
  return resolveMarqueeConfigs(settings)[surface];
}

export function marqueeMessagesForSurface(config: MarqueeSurfaceConfig): string[] {
  return config.messages.map((message) => message.trim()).filter(Boolean);
}

export function isMarqueeSurfaceActive(config: MarqueeSurfaceConfig, now = Date.now()): boolean {
  if (!config.enabled) return false;
  if (marqueeMessagesForSurface(config).length === 0) return false;

  const endAt = config.endAt.trim();
  if (!endAt) return true;

  const endMs = new Date(endAt).getTime();
  return Number.isFinite(endMs) && now < endMs;
}

export function isMarqueeVisibleOn(
  settings: AppSettings,
  surface: MarqueeSurface,
  now = Date.now(),
): boolean {
  return isMarqueeSurfaceActive(getMarqueeSurfaceConfig(settings, surface), now);
}

export function marqueeFontFamilyStack(family: ReceiptFontFamily): string {
  return receiptFontStack(family);
}

export function toDatetimeLocalValue(iso: string): string {
  if (!iso.trim()) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): string {
  if (!value.trim()) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function parseMarqueeConfigsJson(raw: unknown): MarqueeConfigs | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const base = defaultMarqueeConfigs();
  const row = raw as Record<string, unknown>;
  return {
    pos: normalizeSurfaceConfig(row.pos ?? base.pos),
    client: normalizeSurfaceConfig(row.client ?? base.client),
    kds: normalizeSurfaceConfig(row.kds ?? base.kds),
    bar: normalizeSurfaceConfig(row.bar ?? base.bar),
  };
}

/** Sync legacy columns from pos config for older DB readers. */
export function legacyMarqueeFieldsFromConfigs(configs: MarqueeConfigs): Pick<
  AppSettings,
  | "marqueeEnabled"
  | "marqueeText"
  | "marqueeDurationSeconds"
  | "marqueeFontFamily"
  | "marqueeEndAt"
  | "marqueeOnPos"
  | "marqueeOnClient"
  | "marqueeOnKds"
  | "marqueeOnBar"
> {
  const pos = configs.pos;
  const messages = marqueeMessagesForSurface(pos);
  return {
    marqueeEnabled: pos.enabled && messages.length > 0,
    marqueeText: messages[0] ?? "",
    marqueeDurationSeconds: pos.durationSeconds,
    marqueeFontFamily: pos.fontFamily,
    marqueeEndAt: pos.endAt,
    marqueeOnPos: pos.enabled,
    marqueeOnClient: configs.client.enabled,
    marqueeOnKds: configs.kds.enabled,
    marqueeOnBar: configs.bar.enabled,
  };
}
