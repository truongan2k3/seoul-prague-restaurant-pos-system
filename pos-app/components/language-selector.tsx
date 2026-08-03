"use client";

import { useApp } from "@/contexts/app-context";
import { LANGUAGE_OPTIONS } from "@/lib/i18n/languages";
import { filterButtonClass } from "@/lib/theme-classes";
import type { LanguageCode } from "@/lib/types";

interface LanguageSelectorProps {
  variant?: "sidebar" | "segmented" | "dropdown" | "compact";
  className?: string;
  language?: LanguageCode;
  onLanguageChange?: (language: LanguageCode) => void;
  compact?: boolean;
}

export function LanguageSelector({
  variant = "segmented",
  className = "",
  language: languageProp,
  onLanguageChange,
  compact = false,
}: LanguageSelectorProps) {
  const app = useApp();
  const language = languageProp ?? app.language;
  const setLanguage = onLanguageChange ?? app.setLanguage;

  if (variant === "dropdown") {
    return (
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as LanguageCode)}
        className={`w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 shadow-sm outline-none focus:ring-2 focus:ring-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 ${className}`}
        aria-label="Select language"
      >
        {LANGUAGE_OPTIONS.map(({ code, flag, label }) => (
          <option key={code} value={code}>
            {flag} {label}
          </option>
        ))}
      </select>
    );
  }

  if (variant === "sidebar" || variant === "compact") {
    const isCompact = variant === "compact" || compact;
    return (
      <div
        className={`flex flex-row gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1 dark:border-zinc-700 dark:bg-zinc-800 ${className}`}
        role="group"
        aria-label="Select language"
      >
        {LANGUAGE_OPTIONS.map(({ code, flag, label }) => {
          const active = language === code;
          return (
            <button
              key={code}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={active}
              onClick={() => setLanguage(code)}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-2 text-sm transition-colors ${
                isCompact ? "px-1 py-1.5" : ""
              } ${
                active
                  ? "pos-filter-btn-active shadow-sm"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-white"
              }`}
            >
              <span aria-hidden className="shrink-0 text-base leading-none">
                {flag}
              </span>
              {!isCompact && (
                <span className="truncate text-[11px] font-medium leading-tight">{label}</span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`flex flex-nowrap gap-2 overflow-x-auto ${className}`}>
      {LANGUAGE_OPTIONS.map(({ code, flag, label }) => {
        const active = language === code;
        return (
          <button
            key={code}
            type="button"
            aria-pressed={active}
            onClick={() => setLanguage(code)}
            className={filterButtonClass(active)}
          >
            <span aria-hidden>{flag}</span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
