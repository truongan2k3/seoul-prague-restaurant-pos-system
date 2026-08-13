"use client";

import { useState } from "react";
import { ArrowDownAZ, ListOrdered } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import type { MenuSortMode } from "@/lib/types";

function SortModeCard({
  title,
  hint,
  value,
  disabled,
  onChange,
}: {
  title: string;
  hint: string;
  value: MenuSortMode;
  disabled?: boolean;
  onChange: (mode: MenuSortMode) => void;
}) {
  const { translate } = useApp();

  const options: { id: MenuSortMode; label: string; icon: typeof ListOrdered }[] = [
    { id: "custom", label: translate("storageSortCustom"), icon: ListOrdered },
    { id: "alphabetical", label: translate("storageSortAlphabetical"), icon: ArrowDownAZ },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:p-5">
      <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const Icon = option.icon;
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.id)}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition ${
                selected
                  ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950 dark:text-emerald-100"
                  : "border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
              } disabled:opacity-50`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="font-medium">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function StorageSortSettings() {
  const { translate } = useApp();
  const { settings, saveSettings, saving } = useSettings();
  const [error, setError] = useState<string | null>(null);

  const updateMode = async (key: "menuCategorySortMode" | "menuItemSortMode", mode: MenuSortMode) => {
    setError(null);
    const ok = await saveSettings({ [key]: mode });
    if (!ok) setError(translate("saveFailed"));
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {translate("storageTabSort")}
        </h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {translate("storageSortHint")}
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <SortModeCard
        title={translate("storageSortCategories")}
        hint={translate("storageSortCategoriesHint")}
        value={settings.menuCategorySortMode}
        disabled={saving}
        onChange={(mode) => void updateMode("menuCategorySortMode", mode)}
      />

      <SortModeCard
        title={translate("storageSortMenuItems")}
        hint={translate("storageSortMenuItemsHint")}
        value={settings.menuItemSortMode}
        disabled={saving}
        onChange={(mode) => void updateMode("menuItemSortMode", mode)}
      />

      {settings.menuCategorySortMode === "custom" || settings.menuItemSortMode === "custom" ? (
        <p className="rounded-lg border border-dashed border-gray-300 px-4 py-3 text-xs text-gray-500 dark:border-gray-600 dark:text-gray-400">
          {translate("storageSortDragHint")}
        </p>
      ) : null}
    </div>
  );
}
