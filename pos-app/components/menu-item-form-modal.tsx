"use client";

import { useEffect, useState } from "react";
import { MenuCustomizationEditor } from "@/components/menu-customization-editor";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import { DEFAULT_MENU_CATEGORY } from "@/lib/menu-categories";
import { resolveStation } from "@/lib/order-routing";
import { segmentButtonClass } from "@/lib/theme-classes";
import type { MenuCategoryRecord, MenuItem, Station } from "@/lib/types";
import { emptyMenuItemInput, type MenuItemInput } from "@/src/lib/menu-actions";

type LocaleTab = "en" | "cz" | "zh";

const localeTabs: { id: LocaleTab; label: string }[] = [
  { id: "en", label: "English" },
  { id: "cz", label: "Czech" },
  { id: "zh", label: "Chinese" },
];

interface MenuItemFormModalProps {
  open: boolean;
  item?: MenuItem | null;
  categories: MenuCategoryRecord[];
  onClose: () => void;
  onSave: (input: MenuItemInput) => Promise<void>;
  isSaving?: boolean;
}

export function MenuItemFormModal({
  open,
  item,
  categories,
  onClose,
  onSave,
  isSaving = false,
}: MenuItemFormModalProps) {
  const { translate } = useApp();
  const [form, setForm] = useState<MenuItemInput>(emptyMenuItemInput);
  const [activeTab, setActiveTab] = useState<LocaleTab>("en");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setActiveTab("en");
    if (item) {
      setForm({
        nameEn: item.nameEn,
        nameCz: item.nameCz,
        nameZh: item.nameZh,
        descriptionEn: item.descriptionEn ?? "",
        descriptionCz: item.descriptionCz ?? "",
        descriptionZh: item.descriptionZh ?? "",
        category: item.category,
        categoryId: item.categoryId ?? null,
        price: item.price,
        imageUrl: item.imageUrl ?? "",
        isAvailable: item.isAvailable,
        sortOrder: item.sortOrder,
        station: item.station,
        itemType: item.itemType,
        customizationConfig: item.customizationConfig,
      });
    } else {
      const defaultCategory = categories[0];
      const itemType = defaultCategory?.type === "drink" ? "drink" : "food";
      const categoryName = defaultCategory?.name ?? DEFAULT_MENU_CATEGORY;
      setForm({
        ...emptyMenuItemInput,
        category: categoryName,
        categoryId: defaultCategory?.id ?? null,
        itemType,
        station: resolveStation(categoryName, itemType),
      });
    }
  }, [open, item, categories]);

  const handleSubmit = async () => {
    if (!form.nameEn.trim()) {
      setError("English name is required");
      setActiveTab("en");
      return;
    }
    if (!form.category.trim()) {
      setError("Category is required");
      return;
    }
    if (form.price < 0) {
      setError("Price must be zero or greater");
      return;
    }
    setError(null);
    await onSave(form);
  };

  const selectedCategoryId =
    form.categoryId ??
    categories.find((category) => category.name === form.category)?.id ??
    null;

  const defaultStation = resolveStation(form.category, form.itemType);
  const selectedStation: Station = form.station ?? defaultStation;

  const nameKey = activeTab === "en" ? "nameEn" : activeTab === "cz" ? "nameCz" : "nameZh";
  const descriptionKey =
    activeTab === "en" ? "descriptionEn" : activeTab === "cz" ? "descriptionCz" : "descriptionZh";

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={item ? "Edit Menu Item" : "New Menu Item"}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void handleSubmit()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="pos-segment">
          {localeTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-3 py-2 text-sm ${segmentButtonClass(activeTab === tab.id)}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Name ({activeTab.toUpperCase()})
          </span>
          <input
            value={form[nameKey]}
            onChange={(e) => setForm((f) => ({ ...f, [nameKey]: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-gray-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-100"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Description ({activeTab.toUpperCase()})
          </span>
          <textarea
            rows={3}
            value={form[descriptionKey] ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, [descriptionKey]: e.target.value }))}
            placeholder="Optional description for staff and receipts"
            className="mt-1 w-full resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm text-gray-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-100"
          />
        </label>

        <div className="border-t border-zinc-200 pt-4 dark:border-zinc-700">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Item details
          </p>

          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Category</span>
              <select
                value={selectedCategoryId ?? ""}
                onChange={(e) => {
                  const category = categories.find((entry) => entry.id === e.target.value);
                  if (!category) return;
                  const itemType = category.type === "drink" ? "drink" : "food";
                  setForm((f) => ({
                    ...f,
                    categoryId: category.id,
                    category: category.name,
                    itemType,
                    station: resolveStation(category.name, itemType),
                  }));
                }}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-gray-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-100"
              >
                {categories.length === 0 ? (
                  <option value="">{DEFAULT_MENU_CATEGORY}</option>
                ) : (
                  categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Price (Kč)</span>
              <input
                type="number"
                min={0}
                step={1}
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-gray-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-100"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Image URL</span>
              <input
                type="url"
                value={form.imageUrl ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                placeholder="https://..."
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-gray-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-100"
              />
            </label>

            {form.imageUrl && (
              <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={form.imageUrl}
                  alt="Preview"
                  className="h-32 w-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isAvailable}
                onChange={(e) => setForm((f) => ({ ...f, isAvailable: e.target.checked }))}
                className="rounded border-zinc-300"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Available on menu</span>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {translate("menuItemRoute")}
              </span>
              <select
                value={selectedStation}
                onChange={(e) =>
                  setForm((f) => ({ ...f, station: e.target.value as Station }))
                }
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-gray-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-100"
              >
                <option value="kitchen">{translate("menuItemRouteKitchen")}</option>
                <option value="bar">{translate("menuItemRouteBar")}</option>
              </select>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {translate("menuItemRouteHint")}
              </p>
            </label>
          </div>
        </div>

        <MenuCustomizationEditor
          value={form.customizationConfig}
          onChange={(customizationConfig) =>
            setForm((current) => ({ ...current, customizationConfig }))
          }
        />
      </div>
    </Modal>
  );
}
