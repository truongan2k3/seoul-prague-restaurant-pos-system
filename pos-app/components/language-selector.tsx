"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/contexts/app-context";
import { LANGUAGE_OPTIONS } from "@/lib/i18n/languages";
import { filterButtonClass } from "@/lib/theme-classes";
import type { LanguageCode } from "@/lib/types";

interface LanguageSelectorProps {
  variant?: "sidebar" | "segmented" | "dropdown" | "compact" | "flag-menu";
  className?: string;
  language?: LanguageCode;
  onLanguageChange?: (language: LanguageCode) => void;
  compact?: boolean;
  /** Visual style for flag-menu on dark backgrounds */
  tone?: "light" | "dark";
}

export function LanguageSelector({
  variant = "segmented",
  className = "",
  language: languageProp,
  onLanguageChange,
  compact = false,
  tone = "light",
}: LanguageSelectorProps) {
  const app = useApp();
  const language = languageProp ?? app.language;
  const setLanguage = onLanguageChange ?? app.setLanguage;

  if (variant === "flag-menu") {
    return (
      <FlagLanguageMenu
        language={language}
        onLanguageChange={setLanguage}
        className={className}
        tone={tone}
      />
    );
  }

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

function FlagLanguageMenu({
  language,
  onLanguageChange,
  className,
  tone,
}: {
  language: LanguageCode;
  onLanguageChange: (language: LanguageCode) => void;
  className?: string;
  tone: "light" | "dark";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = LANGUAGE_OPTIONS.find((option) => option.code === language) ?? LANGUAGE_OPTIONS[0];

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open]);

  const buttonClass =
    tone === "dark"
      ? "border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800"
      : "border-gray-200 bg-white text-gray-900 hover:bg-gray-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700";

  const menuClass =
    tone === "dark"
      ? "border-zinc-700 bg-zinc-900 shadow-xl"
      : "border-gray-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900";

  const optionActiveClass =
    tone === "dark" ? "bg-zinc-800 text-white" : "bg-gray-100 text-gray-900 dark:bg-zinc-800 dark:text-white";

  const optionIdleClass =
    tone === "dark"
      ? "text-zinc-300 hover:bg-zinc-800/70 hover:text-white"
      : "text-gray-700 hover:bg-gray-50 dark:text-zinc-300 dark:hover:bg-zinc-800";

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={current.label}
        title={current.label}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border text-lg leading-none transition-colors ${buttonClass}`}
      >
        <span aria-hidden>{current.flag}</span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Select language"
          className={`absolute right-0 top-full z-50 mt-1 flex flex-col gap-0.5 overflow-hidden rounded-lg border p-1 ${menuClass}`}
        >
          {LANGUAGE_OPTIONS.map(({ code, flag, label }) => {
            const active = code === language;
            return (
              <li key={code} role="option" aria-selected={active}>
                <button
                  type="button"
                  title={label}
                  aria-label={label}
                  onClick={() => {
                    onLanguageChange(code);
                    setOpen(false);
                  }}
                  className={`flex h-9 w-9 items-center justify-center rounded-md text-lg leading-none transition-colors ${
                    active ? optionActiveClass : optionIdleClass
                  }`}
                >
                  <span aria-hidden>{flag}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
