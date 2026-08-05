import { receiptFontStack } from "@/lib/receipt-print-styles";
import type { AppSettings, ReceiptFontFamily } from "@/lib/types";

export const MARQUEE_SPEED_MIN = 8;
export const MARQUEE_SPEED_MAX = 120;
export const MARQUEE_SPEED_DEFAULT = 28;

export function clampMarqueeDurationSeconds(value: number): number {
  if (!Number.isFinite(value)) return MARQUEE_SPEED_DEFAULT;
  return Math.min(MARQUEE_SPEED_MAX, Math.max(MARQUEE_SPEED_MIN, Math.round(value)));
}

export function parseMarqueeFontFamily(value: string | null | undefined): ReceiptFontFamily {
  const allowed: ReceiptFontFamily[] = ["consolas", "courier", "arial", "tahoma", "lucida", "georgia"];
  return allowed.includes(value as ReceiptFontFamily) ? (value as ReceiptFontFamily) : "arial";
}

export function isMarqueeActive(settings: AppSettings, now = Date.now()): boolean {
  if (!settings.marqueeEnabled) return false;
  if (!settings.marqueeText.trim()) return false;

  const endAt = settings.marqueeEndAt.trim();
  if (!endAt) return true;

  const endMs = new Date(endAt).getTime();
  return Number.isFinite(endMs) && now < endMs;
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
