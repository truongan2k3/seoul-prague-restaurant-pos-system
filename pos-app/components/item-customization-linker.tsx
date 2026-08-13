"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, SlidersHorizontal } from "lucide-react";
import { MenuItemFormModal } from "@/components/menu-item-form-modal";
import { useApp } from "@/contexts/app-context";
import { hasCustomization } from "@/lib/menu-customization";
import { menuItemDisplayName } from "@/lib/menu-display";
import type { MenuCategoryRecord, MenuItem, NotePreset, OptionGroupLibraryEntry } from "@/lib/types";
import { updateMenuItem, type MenuItemInput } from "@/src/lib/menu-actions";
import {
  fetchAllNotePresetsAdmin,
  mapNotePresetsResponse,
} from "@/src/lib/note-preset-actions";
import {
  fetchOptionGroupLibrary,
  mapOptionGroupLibraryResponse,
} from "@/src/lib/option-group-library-actions";

interface ItemCustomizationLinkerProps {
  menuItems: MenuItem[];
  categories: MenuCategoryRecord[];
  onChange: () => void;
}

export function ItemCustomizationLinker({
  menuItems,
  categories,
  onChange,
}: ItemCustomizationLinkerProps) {
  const { language, logAction, translate } = useApp();
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [library, setLibrary] = useState<OptionGroupLibraryEntry[]>([]);
  const [notePresets, setNotePresets] = useState<NotePreset[]>([]);

  const reloadCatalogs = useCallback(async () => {
    const [libraryRes, presetsRes] = await Promise.all([
      fetchOptionGroupLibrary(false),
      fetchAllNotePresetsAdmin(),
    ]);
    if (!libraryRes.error) {
      setLibrary(mapOptionGroupLibraryResponse(libraryRes.data));
    }
    if (!presetsRes.error) {
      setNotePresets(mapNotePresetsResponse(presetsRes.data));
    }
  }, []);

  useEffect(() => {
    void reloadCatalogs();
  }, [reloadCatalogs]);

  const customizedItems = useMemo(
    () => menuItems.filter((item) => hasCustomization(item)),
    [menuItems],
  );

  const handleSave = async (input: MenuItemInput) => {
    if (!editing) return;
    setIsSaving(true);
    setError(null);
    const { error: saveError } = await updateMenuItem(editing.id, {
      ...input,
      sortOrder: editing.sortOrder,
    });
    setIsSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    logAction("update menu customization", menuItemDisplayName(editing, language));
    setEditing(null);
    onChange();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <SlidersHorizontal className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {translate("storageTabItemOptions")}
          </h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {translate("menuItemCustomizationsHint")}
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {customizedItems.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          {translate("noCustomizedItems")}
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-700 dark:bg-gray-800">
          {customizedItems.map((item) => {
            const libraryCount = item.customizationConfig?.optionGroupLibraryIds?.length ?? 0;
            const groupCount = item.customizationConfig?.optionGroups?.length ?? libraryCount;
            return (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {menuItemDisplayName(item, language)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {item.category} · {groupCount} {translate("optionGroupChoices").toLowerCase()}
                    {libraryCount > 0 ? ` · ${libraryCount} ${translate("fromLibrary")}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(item)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold dark:border-gray-600"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {translate("editMenuCustomization")}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <MenuItemFormModal
        open={editing !== null}
        item={editing}
        categories={categories}
        libraryGroups={library}
        notePresets={notePresets}
        onClose={() => setEditing(null)}
        onSave={handleSave}
        isSaving={isSaving}
      />
    </div>
  );
}
