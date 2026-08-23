import type { LanguageCode, SaleRecord } from "@/lib/types";

export function resolveGuestSeatedAt(sale: SaleRecord): Date | undefined {
  if (sale.seatedAt) return sale.seatedAt;

  const itemTimes = sale.items
    .map((item) => item.createdAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value));

  if (itemTimes.length === 0) return undefined;
  return new Date(Math.min(...itemTimes));
}

export function formatHistoryDateTime(date: Date | undefined, language: LanguageCode): string {
  if (!date) return "—";
  const locale = language === "cs" ? "cs-CZ" : language === "zh" ? "zh-CN" : "en-GB";
  return date.toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
