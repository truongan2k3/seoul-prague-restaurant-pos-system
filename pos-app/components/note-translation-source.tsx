"use client";

import { useApp } from "@/contexts/app-context";
import type { NoteTranslationResult } from "@/src/lib/translator";

const labels = {
  en: {
    source: "Source", google: "Google Translate", mymemory: "MyMemory (Translated)",
    local: "Internal kitchen dictionary", original: "Original Chinese text",
    unavailable: "Translation unavailable — original text", cached: "cached",
    preset: "Saved note presets", loading: "Translating…",
  },
  cs: {
    source: "Zdroj", google: "Google Translate", mymemory: "MyMemory (Translated)",
    local: "Interní kuchyňský slovník", original: "Původní čínský text",
    unavailable: "Překlad není dostupný — původní text", cached: "z mezipaměti",
    preset: "Uložené předvolby poznámek", loading: "Překládám…",
  },
  vi: {
    source: "Nguồn", google: "Google Translate", mymemory: "MyMemory (Translated)",
    local: "Từ điển bếp nội bộ", original: "Văn bản gốc tiếng Trung",
    unavailable: "Không dịch được — giữ nguyên văn", cached: "từ bộ nhớ đệm",
    preset: "Mẫu ghi chú có sẵn", loading: "Đang dịch…",
  },
  zh: {
    source: "来源", google: "Google 翻译", mymemory: "MyMemory (Translated)",
    local: "内部厨房词典", original: "中文原文",
    unavailable: "翻译不可用 — 保留原文", cached: "缓存",
    preset: "预设备注", loading: "翻译中…",
  },
} as const;

/** Provenance for this preview only; never added to the saved/printed note text. */
export function NoteTranslationSource({ result, pending, hasPresets = false }: {
  result?: NoteTranslationResult;
  pending: boolean;
  hasPresets?: boolean;
}) {
  const { language } = useApp();
  const copy = labels[language];
  const sources: string[] = [];
  if (hasPresets) sources.push(copy.preset);
  if (pending) sources.push(copy.loading);
  else if (result) sources.push(`${copy[result.provider]}${result.cached ? ` (${copy.cached})` : ""}`);
  if (!sources.length) return null;

  return <p className="mt-2 text-[11px] font-medium leading-relaxed text-orange-800 dark:text-orange-200">
    {copy.source}: {sources.join(" · ")}
  </p>;
}
