"use client";

import { useMemo, useState } from "react";
import type { TranslationKey } from "@/lib/i18n/translations";
import { LANGUAGE_OPTIONS } from "@/lib/i18n/languages";
import { menuItemDisplayName } from "@/lib/menu-display";
import { normalizeServerScreenLanguages } from "@/lib/server-screen";
import type {
  LanguageCode,
  MenuItem,
  ServerScreenConfig,
  ServerScreenLanguageMode,
} from "@/lib/types";

const MODE_OPTIONS: { id: ServerScreenLanguageMode; labelKey: TranslationKey }[] = [
  { id: "single", labelKey: "serverScreenLangModeSingle" },
  { id: "bilingual", labelKey: "serverScreenLangModeBilingual" },
  { id: "multilingual", labelKey: "serverScreenLangModeMulti" },
];

export function ServerScreenSettingsEditor({
  value,
  onChange,
  translate,
  menuItems = [],
  language = "en",
}: {
  value: ServerScreenConfig;
  onChange: (next: ServerScreenConfig) => void;
  translate: (key: TranslationKey) => string;
  menuItems?: MenuItem[];
  language?: LanguageCode;
}) {
  const languages = normalizeServerScreenLanguages(value.languageMode, value.languages);
  const forceChineseIds = value.forceChineseMenuItemIds ?? [];
  const [forceZhQuery, setForceZhQuery] = useState("");

  const sortedMenuItems = useMemo(() => {
    return menuItems
      .slice()
      .sort((a, b) =>
        menuItemDisplayName(a, language).localeCompare(menuItemDisplayName(b, language), undefined, {
          sensitivity: "base",
        }),
      );
  }, [menuItems, language]);

  const filteredMenuItems = useMemo(() => {
    const q = forceZhQuery.trim().toLowerCase();
    if (!q) return sortedMenuItems;
    return sortedMenuItems.filter((item) => {
      const hay = [item.nameEn, item.nameCz, item.nameZh, item.category]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [sortedMenuItems, forceZhQuery]);

  const setMode = (languageMode: ServerScreenLanguageMode) => {
    onChange({
      ...value,
      languageMode,
      languages: normalizeServerScreenLanguages(languageMode, value.languages),
    });
  };

  const toggleLanguage = (lang: LanguageCode) => {
    let next = languages.includes(lang)
      ? languages.filter((row) => row !== lang)
      : [...languages, lang];
    if (next.length === 0) next = [lang];
    onChange({
      ...value,
      languages: normalizeServerScreenLanguages(value.languageMode, next),
    });
  };

  const moveLanguage = (lang: LanguageCode, direction: -1 | 1) => {
    const index = languages.indexOf(lang);
    if (index < 0) return;
    const target = index + direction;
    if (target < 0 || target >= languages.length) return;
    const next = languages.slice();
    const [removed] = next.splice(index, 1);
    next.splice(target, 0, removed!);
    onChange({
      ...value,
      languages: normalizeServerScreenLanguages(value.languageMode, next),
    });
  };

  const toggleForceChinese = (menuItemId: string) => {
    const next = forceChineseIds.includes(menuItemId)
      ? forceChineseIds.filter((id) => id !== menuItemId)
      : [...forceChineseIds, menuItemId];
    onChange({ ...value, forceChineseMenuItemIds: next });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">
          {translate("settingsTabServerScreen")}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {translate("serverScreenSettingsHint")}
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {translate("serverScreenLangMode")}
        </legend>
        <div className="flex flex-wrap gap-2">
          {MODE_OPTIONS.map((option) => {
            const active = value.languageMode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setMode(option.id)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "border-[var(--pos-brand)] bg-[var(--pos-brand)]/10 text-[var(--pos-brand)]"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                }`}
              >
                {translate(option.labelKey)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {translate("serverScreenLanguages")}
        </legend>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {value.languageMode === "single"
            ? translate("serverScreenLanguagesSingleHint")
            : value.languageMode === "bilingual"
              ? translate("serverScreenLanguagesBilingualHint")
              : translate("serverScreenLanguagesMultiHint")}
        </p>
        <ul className="space-y-2">
          {LANGUAGE_OPTIONS.map((option) => {
            const selected = languages.includes(option.code);
            const order = languages.indexOf(option.code);
            return (
              <li
                key={option.code}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700"
              >
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800 dark:text-gray-100">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleLanguage(option.code)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span>
                    {option.flag} {option.label}
                  </span>
                  {selected && languages.length > 1 ? (
                    <span className="text-xs text-gray-400">#{order + 1}</span>
                  ) : null}
                </label>
                {selected && languages.length > 1 ? (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-600"
                      onClick={() => moveLanguage(option.code, -1)}
                      disabled={order <= 0}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-600"
                      onClick={() => moveLanguage(option.code, 1)}
                      disabled={order >= languages.length - 1}
                    >
                      ↓
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </fieldset>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
        <input
          type="checkbox"
          checked={value.autoRotateLanguage}
          onChange={(e) => onChange({ ...value, autoRotateLanguage: e.target.checked })}
          className="mt-1 h-4 w-4 rounded border-gray-300"
        />
        <span>
          <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">
            {translate("serverScreenAutoRotate")}
          </span>
          <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
            {translate("serverScreenAutoRotateHint")}
          </span>
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
        <input
          type="checkbox"
          checked={value.showPaymentOverlayOnKds}
          onChange={(e) => onChange({ ...value, showPaymentOverlayOnKds: e.target.checked })}
          className="mt-1 h-4 w-4 rounded border-gray-300"
        />
        <span>
          <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">
            {translate("serverScreenPaymentOverlayKds")}
          </span>
          <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
            {translate("serverScreenPaymentOverlayKdsHint")}
          </span>
        </span>
      </label>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {translate("serverScreenForceChineseItems")}
        </legend>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {translate("serverScreenForceChineseItemsHint")}
        </p>
        <input
          type="search"
          value={forceZhQuery}
          onChange={(event) => setForceZhQuery(event.target.value)}
          placeholder={translate("serverScreenForceChineseItemsSearch")}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-[var(--pos-brand)] focus:ring-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
          {filteredMenuItems.length === 0 ? (
            <p className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
              {translate("serverScreenForceChineseItemsEmpty")}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredMenuItems.map((item) => {
                const checked = forceChineseIds.includes(item.id);
                const primary = menuItemDisplayName(item, language);
                const zh = item.nameZh.trim();
                return (
                  <li key={item.id}>
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/60">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleForceChinese(item.id)}
                        className="mt-1 h-4 w-4 rounded border-gray-300"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                          {primary}
                        </span>
                        <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                          {item.category}
                          {zh ? ` · ${zh}` : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {forceChineseIds.length > 0 ? (
          <p className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
            {translate("serverScreenForceChineseItemsSelected").replace(
              "{count}",
              String(forceChineseIds.length),
            )}
          </p>
        ) : null}
      </fieldset>
    </div>
  );
}
