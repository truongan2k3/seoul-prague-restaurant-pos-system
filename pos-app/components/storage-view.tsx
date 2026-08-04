"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderTree } from "lucide-react";
import { CategoryManagerModal } from "@/components/category-manager-modal";
import { LiveClock } from "@/components/live-clock";
import { InventoryManager } from "@/components/inventory-manager";
import { MenuManager } from "@/components/menu-manager";
import { NotePresetManager } from "@/components/note-preset-manager";
import { useApp } from "@/contexts/app-context";
import type { InventoryItem, MenuCategoryRecord, MenuItem, NotePreset } from "@/lib/types";
import {
  fetchAllNotePresetsAdmin,
  mapNotePresetsResponse,
} from "@/src/lib/note-preset-actions";

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
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [notePresets, setNotePresets] = useState<NotePreset[]>([]);

  const reloadNotePresets = useCallback(async () => {
    const { data } = await fetchAllNotePresetsAdmin();
    setNotePresets(mapNotePresetsResponse(data));
  }, []);

  useEffect(() => {
    void reloadNotePresets();
  }, [reloadNotePresets]);

  const commercial = inventory.filter((i) => i.category === "commercial");
  const internal = inventory.filter((i) => i.category === "internal");

  return (
    <div className="flex h-full flex-col bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 sm:px-6 sm:py-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{translate("storage")}</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Menu & inventory — synced with Supabase</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCategoryModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
          >
            <FolderTree className="h-4 w-4" />
            {translate("manageCategories")}
          </button>
          <LiveClock />
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <MenuManager menuItems={menuItems} categories={categories} onChange={onRefresh} />

          <NotePresetManager
            presets={notePresets}
            onChange={() => {
              void reloadNotePresets();
            }}
          />

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
        </div>
      </div>

      <CategoryManagerModal
        open={categoryModalOpen}
        categories={categories}
        onClose={() => setCategoryModalOpen(false)}
        onChange={onRefresh}
      />
    </div>
  );
}
