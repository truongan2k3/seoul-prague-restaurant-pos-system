"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownAZ,
  FolderTree,
  LayoutList,
  Package,
  SlidersHorizontal,
  StickyNote,
  UtensilsCrossed,
} from "lucide-react";
import { CategoryManagerModal } from "@/components/category-manager-modal";
import { ItemCustomizationLinker } from "@/components/item-customization-linker";
import { LiveClock } from "@/components/live-clock";
import { InventoryManager } from "@/components/inventory-manager";
import { MenuManager } from "@/components/menu-manager";
import { NotePresetManager } from "@/components/note-preset-manager";
import { OptionGroupLibraryManager } from "@/components/option-group-library-manager";
import { StorageSortSettings } from "@/components/storage-sort-settings";
import { useApp } from "@/contexts/app-context";
import type { InventoryItem, MenuCategoryRecord, MenuItem, NotePreset, OptionGroupLibraryEntry } from "@/lib/types";
import {
  fetchAllNotePresetsAdmin,
  mapNotePresetsResponse,
} from "@/src/lib/note-preset-actions";
import {
  fetchOptionGroupLibrary,
  mapOptionGroupLibraryResponse,
} from "@/src/lib/option-group-library-actions";
import { resetStorageCatalogSync } from "@/src/lib/sync-storage-catalog";

type StorageTab =
  | "menu"
  | "categories"
  | "special-requests"
  | "addons"
  | "item-options"
  | "sort"
  | "inventory";

export function StorageView({
  inventory,
  menuItems,
  categories,
  onRefresh,
}: {
  inventory: InventoryItem[];
  menuItems: MenuItem[];
  categories: MenuCategoryRecord[];
  onRefresh: () => void;
}) {
  const { translate } = useApp();
  const [activeTab, setActiveTab] = useState<StorageTab>("menu");
  const [notePresets, setNotePresets] = useState<NotePreset[]>([]);
  const [library, setLibrary] = useState<OptionGroupLibraryEntry[]>([]);

  const reloadNotePresets = useCallback(async () => {
    const { data } = await fetchAllNotePresetsAdmin();
    setNotePresets(mapNotePresetsResponse(data).filter((preset) => preset.active));
  }, []);

  const reloadLibrary = useCallback(async () => {
    const { data, error } = await fetchOptionGroupLibrary(true);
    if (!error) setLibrary(mapOptionGroupLibraryResponse(data));
  }, []);

  useEffect(() => {
    resetStorageCatalogSync();
    void reloadNotePresets();
    void reloadLibrary();
  }, [reloadNotePresets, reloadLibrary]);

  const commercial = inventory.filter((i) => i.category === "commercial");
  const internal = inventory.filter((i) => i.category === "internal");

  const tabs = useMemo(
    (): { id: StorageTab; label: string; icon: typeof UtensilsCrossed }[] => [
      { id: "menu", label: translate("storageTabMenu"), icon: UtensilsCrossed },
      { id: "categories", label: translate("storageTabCategories"), icon: FolderTree },
      { id: "special-requests", label: translate("storageTabSpecialRequests"), icon: StickyNote },
      { id: "addons", label: translate("storageTabAddons"), icon: LayoutList },
      { id: "item-options", label: translate("storageTabItemOptions"), icon: SlidersHorizontal },
      { id: "sort", label: translate("storageTabSort"), icon: ArrowDownAZ },
      { id: "inventory", label: translate("storageTabInventory"), icon: Package },
    ],
    [translate],
  );

  return (
    <div className="flex h-full flex-col bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 sm:px-6 sm:py-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {translate("storage")}
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {translate("storageSubtitle")}
          </p>
        </div>
        <LiveClock />
      </header>

      <div className="shrink-0 overflow-x-auto border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900 sm:px-6">
        <nav className="flex gap-1 py-2" aria-label={translate("storage")}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  selected
                    ? "bg-emerald-600 text-white"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl">
          {activeTab === "menu" && (
            <MenuManager menuItems={menuItems} categories={categories} onChange={onRefresh} />
          )}

          {activeTab === "categories" && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:p-5">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
                {translate("manageCategories")}
              </h2>
              <CategoryManagerModal
                open
                embedded
                categories={categories}
                onClose={() => {}}
                onChange={onRefresh}
              />
            </div>
          )}

          {activeTab === "special-requests" && (
            <NotePresetManager
              presets={notePresets}
              onChange={() => {
                void reloadNotePresets();
              }}
            />
          )}

          {activeTab === "addons" && (
            <OptionGroupLibraryManager
              entries={library}
              onChange={() => {
                void reloadLibrary();
                onRefresh();
              }}
            />
          )}

          {activeTab === "item-options" && (
            <ItemCustomizationLinker
              menuItems={menuItems}
              categories={categories}
              onChange={onRefresh}
            />
          )}

          {activeTab === "sort" && <StorageSortSettings />}

          {activeTab === "inventory" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <InventoryManager
                title={translate("commercial")}
                items={commercial}
                defaultCategory="commercial"
                onChange={onRefresh}
              />
              <InventoryManager
                title={translate("internal")}
                items={internal}
                defaultCategory="internal"
                onChange={onRefresh}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
