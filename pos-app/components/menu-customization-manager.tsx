"use client";

import { useMemo, useState } from "react";
import { Pencil, SlidersHorizontal } from "lucide-react";
import { MenuItemFormModal } from "@/components/menu-item-form-modal";
import { useApp } from "@/contexts/app-context";
import { hasCustomization } from "@/lib/menu-customization";
import { menuItemDisplayName } from "@/lib/menu-display";
import type { MenuCategoryRecord, MenuItem } from "@/lib/types";
import { updateMenuItem, type MenuItemInput } from "@/src/lib/menu-actions";

interface MenuCustomizationManagerProps {
  menuItems: MenuItem[];
  categories: MenuCategoryRecord[];
  onChange: () => void;
}

export function MenuCustomizationManager({
  menuItems,
  categories,
  onChange,
}: MenuCustomizationManagerProps) {
  const { language, logAction } = useApp();
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <SlidersHorizontal className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">
            Menu option groups / Add-ons
          </h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Manage special requests and priced add-ons on menu items (e.g. Thêm bò +50 Kč). Edit any
            item in Menu Manager, or jump into items that already have options below.
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="mt-4">
        {customizedItems.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No customized items yet. Open a menu item and add an option group.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100 dark:divide-gray-800 dark:border-gray-700">
            {customizedItems.map((item) => {
              const groupCount = item.customizationConfig?.optionGroups?.length ?? 0;
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                      {menuItemDisplayName(item, language)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {item.category} · {groupCount} option group{groupCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing(item)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold dark:border-gray-600"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <MenuItemFormModal
        open={editing !== null}
        item={editing}
        categories={categories}
        onClose={() => setEditing(null)}
        onSave={handleSave}
        isSaving={isSaving}
      />
    </section>
  );
}
