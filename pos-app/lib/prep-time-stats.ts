import type { LanguageCode, OrderItem, SaleRecord, Station } from "@/lib/types";
import { todayIsoDateInVenue, venueDayRangeUtc } from "@/lib/venue-timezone";

export const PREP_STATS_EMPTY_WAIT_MS = 2 * 60 * 1000;
export const PREP_STATS_VISIBLE_MS = 60 * 1000;
export const PREP_STATS_GAP_MS = 5 * 60 * 1000;
export const PREP_STATS_TOP_N = 6;

export type PrepTimeSample = {
  id: string;
  name: string;
  station: Station | null;
  tableId?: string | null;
  tableLabel?: string | null;
  createdAt: string;
  readyAt: string;
  durationMs: number;
};

export type PrepTimeStats = {
  sampleCount: number;
  averageMs: number | null;
  fastest: PrepTimeSample | null;
  slowest: PrepTimeSample | null;
  fastestItems: PrepTimeSample[];
  slowestItems: PrepTimeSample[];
};

export function emptyPrepTimeStats(): PrepTimeStats {
  return {
    sampleCount: 0,
    averageMs: null,
    fastest: null,
    slowest: null,
    fastestItems: [],
    slowestItems: [],
  };
}

/** Duration from created → ready. Null when timestamps are missing/invalid. */
export function prepDurationMs(
  createdAt: string | Date | null | undefined,
  readyAt: string | Date | null | undefined,
): number | null {
  if (!createdAt || !readyAt) return null;
  const start =
    typeof createdAt === "string" ? new Date(createdAt).getTime() : createdAt.getTime();
  const end = typeof readyAt === "string" ? new Date(readyAt).getTime() : readyAt.getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return end - start;
}

function readItemField(item: Record<string, unknown>, camel: string, snake: string): unknown {
  return item[camel] ?? item[snake];
}

/** Build a sample from an order line (live row or sales JSON). */
export function toPrepTimeSample(
  item: Pick<OrderItem, "id" | "name" | "station" | "createdAt" | "readyAt" | "kitchenStatus" | "isCancelled" | "hideOnKds"> & {
    tableId?: string | null;
    tableLabel?: string | null;
  },
  options?: { tableLabelById?: Map<string, string> },
): PrepTimeSample | null {
  if (!item.id) return null;
  if (item.isCancelled || item.kitchenStatus === "cancelled" || item.kitchenStatus === "archived") {
    return null;
  }
  if (item.hideOnKds) return null;
  const durationMs = prepDurationMs(item.createdAt, item.readyAt);
  if (durationMs == null || !item.createdAt || !item.readyAt) return null;

  const tableId = item.tableId ?? null;
  const tableLabel =
    item.tableLabel ??
    (tableId && options?.tableLabelById ? options.tableLabelById.get(tableId) : null) ??
    null;

  return {
    id: item.id,
    name: item.name?.trim() || "—",
    station: item.station ?? null,
    tableId,
    tableLabel,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : item.createdAt,
    readyAt: typeof item.readyAt === "string" ? item.readyAt : item.readyAt,
    durationMs,
  };
}

/** Normalize sales JSON line (camel or snake) into a prep sample when readyAt is present. */
export function saleItemToPrepSample(
  raw: OrderItem | Record<string, unknown>,
  tableLabel?: string | null,
): PrepTimeSample | null {
  const row = raw as Record<string, unknown>;
  const id = String(readItemField(row, "id", "id") ?? "").trim();
  if (!id) return null;

  const kitchenStatus = (readItemField(row, "kitchenStatus", "kitchen_status") as string | undefined) ?? undefined;
  const isCancelled = Boolean(readItemField(row, "isCancelled", "is_cancelled")) || kitchenStatus === "cancelled";
  const hideOnKds = Boolean(readItemField(row, "hideOnKds", "hide_on_kds"));
  const createdAt = readItemField(row, "createdAt", "created_at");
  const readyAt = readItemField(row, "readyAt", "ready_at");
  const station = (readItemField(row, "station", "station") as Station | undefined) ?? null;
  const name = String(readItemField(row, "name", "name") ?? "").trim() || "—";
  const tableId = (readItemField(row, "tableId", "table_id") as string | null | undefined) ?? null;

  return toPrepTimeSample(
    {
      id,
      name,
      station: station ?? undefined,
      createdAt: typeof createdAt === "string" ? createdAt : undefined,
      readyAt: typeof readyAt === "string" ? readyAt : undefined,
      kitchenStatus: kitchenStatus as OrderItem["kitchenStatus"],
      isCancelled,
      hideOnKds,
      tableId,
      tableLabel: tableLabel ?? null,
    },
  );
}

export function mergePrepSamples(samples: PrepTimeSample[]): PrepTimeSample[] {
  const byId = new Map<string, PrepTimeSample>();
  for (const sample of samples) {
    if (!sample.id) continue;
    const existing = byId.get(sample.id);
    if (!existing || sample.durationMs < existing.durationMs) {
      byId.set(sample.id, sample);
    }
  }
  return Array.from(byId.values());
}

export function filterPrepSamplesInReadyRange(
  samples: PrepTimeSample[],
  startIso: string,
  endExclusiveIso: string,
): PrepTimeSample[] {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endExclusiveIso).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return [];
  return samples.filter((sample) => {
    const readyMs = new Date(sample.readyAt).getTime();
    if (Number.isNaN(readyMs)) return false;
    return readyMs >= startMs && readyMs < endMs;
  });
}

export function collectPrepSamplesFromSales(
  sales: Array<Pick<SaleRecord, "items" | "tableLabel" | "deletedAt">>,
  options?: { station?: Station; startIso?: string; endExclusiveIso?: string },
): PrepTimeSample[] {
  const collected: PrepTimeSample[] = [];
  for (const sale of sales) {
    if (sale.deletedAt) continue;
    const items = Array.isArray(sale.items) ? sale.items : [];
    for (const item of items) {
      const sample = saleItemToPrepSample(item, sale.tableLabel);
      if (!sample) continue;
      if (options?.station && sample.station && sample.station !== options.station) continue;
      collected.push(sample);
    }
  }
  const merged = mergePrepSamples(collected);
  if (options?.startIso && options?.endExclusiveIso) {
    return filterPrepSamplesInReadyRange(merged, options.startIso, options.endExclusiveIso);
  }
  return merged;
}

export function computePrepTimeStats(
  samples: PrepTimeSample[],
  topN = PREP_STATS_TOP_N,
): PrepTimeStats {
  if (samples.length === 0) return emptyPrepTimeStats();

  const sorted = samples.slice().sort((a, b) => a.durationMs - b.durationMs);
  const total = sorted.reduce((sum, sample) => sum + sample.durationMs, 0);
  const averageMs = total / sorted.length;
  const fastest = sorted[0] ?? null;
  const slowest = sorted[sorted.length - 1] ?? null;

  return {
    sampleCount: sorted.length,
    averageMs,
    fastest,
    slowest,
    fastestItems: sorted.slice(0, topN),
    slowestItems: sorted.slice().reverse().slice(0, topN),
  };
}

/** Short kitchen-style label: &lt;1 min, 1 min, 18 min. */
export function formatPrepDurationShort(ms: number, minLabel = "min"): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return `<1 ${minLabel}`;
  return `${minutes} ${minLabel}`;
}

/**
 * Average-style label with seconds when under an hour: `4m 18s`, `45s`, `1h 2m`.
 */
export function formatPrepDurationDetailed(ms: number, minLabel = "min"): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return seconds > 0 ? `${hours}h ${minutes}m` : `${hours}h ${minutes}m`;
  }
  if (seconds === 0) return `${minutes} ${minLabel}`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function venueTodayRange(): { dateIso: string; startIso: string; endExclusiveIso: string } {
  const dateIso = todayIsoDateInVenue();
  const { startIso, endExclusiveIso } = venueDayRangeUtc(dateIso);
  return { dateIso, startIso, endExclusiveIso };
}

export function shiftVenueDateIso(dateIso: string, deltaDays: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function formatVenueDateLabel(dateIso: string, language: LanguageCode): string {
  const locale = language === "zh" ? "zh-CN" : language === "cs" ? "cs-CZ" : "en-US";
  const { startIso } = venueDayRangeUtc(dateIso);
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Prague",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(startIso));
}
