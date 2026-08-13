"use client";

import { useEffect, useState } from "react";
import { MenuCustomizationEditor } from "@/components/menu-customization-editor";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import { DEFAULT_MENU_CATEGORY } from "@/lib/menu-categories";
import { resolveStation } from "@/lib/order-routing";
import {
  menuItemInputFromRoute,
  menuItemRouteFromItem,
  type MenuItemRoute,
} from "@/lib/menu-item-dispatch";
import type {
  MenuCategoryRecord,
  MenuItem,
  NotePreset,
  OptionGroupLibraryEntry,
} from "@/lib/types";
import { emptyMenuItemInput, type MenuItemInput } from "@/src/lib/menu-actions";

interface MenuItemFormModalProps {
  open: boolean;
  item?: MenuItem | null;
  categories: MenuCategoryRecord[];
  libraryGroups?: OptionGroupLibraryEntry[];
  notePresets?: NotePreset[];
  onClose: () => void;
  onSave: (input: MenuItemInput) => Promise<void>;
  isSaving?: boolean;
}

export function MenuItemFormModal({
  open,
  item,
  categories,
  libraryGroups = [],
  notePresets = [],
  onClose,
  onSave,
  isSaving = false,
}: MenuItemFormModalProps) {
  const { translate } = useApp();
  const [form, setForm] = useState<MenuItemInput>(emptyMenuItemInput);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
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
        billOnly: item.billOnly ?? false,
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
    const nameEn = form.nameEn.trim() || form.nameCz.trim() || form.nameZh.trim();
    const nameCz = form.nameCz.trim() || form.nameEn.trim() || form.nameZh.trim();
    const nameZh = form.nameZh.trim() || form.nameEn.trim() || form.nameCz.trim();

    if (!nameEn) {
      setError("Enter at least one language name");
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
    await onSave({
      ...form,
      nameEn,
      nameCz,
      nameZh,
    });
  };

  const selectedCategoryId =
    form.categoryId ??
    categories.find((category) => category.name === form.category)?.id ??
    null;

  const defaultStation = resolveStation(form.category, form.itemType);
  const selectedRoute: MenuItemRoute = menuItemRouteFromItem({
    billOnly: form.billOnly,
    station: form.station ?? defaultStation,
  });

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
      <div className="space-y-5">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            1. Names (EN / CS / ZH)
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {(
              [
                ["nameEn", "descriptionEn", "English"],
                ["nameCz", "descriptionCz", "Czech"],
                ["nameZh", "descriptionZh", "Chinese"],
              ] as const
            ).map(([nameKey, descKey, label]) => (
              <div
                key={nameKey}
                className="space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700"
              >
                <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200">{label}</p>
                <label className="block">
                  <span className="text-[11px] text-zinc-500">Name</span>
                  <input
                    value={form[nameKey]}
                    onChange={(e) => setForm((f) => ({ ...f, [nameKey]: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-500">Description</span>
                  <textarea
                    rows={3}
                    value={form[descKey] ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, [descKey]: e.target.value }))}
                    className="mt-1 w-full resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </label>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-700">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            2. Category & price
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Category</span>
              <select
                value={selectedCategoryId ?? ""}
                onChange={(e) => {
                  const category = categories.find((entry) => entry.id === e.target.value);
                  if (!category) return;
                  const itemType = category.type === "drink" ? "drink" : "food";
                  setForm((f) => {
                    if (f.billOnly) {
                      return {
                        ...f,
                        categoryId: category.id,
                        category: category.name,
                        itemType,
                      };
                    }
                    const routing = menuItemInputFromRoute(
                      resolveStation(category.name, itemType) === "bar" ? "bar" : "kitchen",
                    );
                    return {
                      ...f,
                      categoryId: category.id,
                      category: category.name,
                      itemType,
                      ...routing,
                    };
                  });
                }}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
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
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Image URL</span>
              <input
                type="url"
                value={form.imageUrl ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                placeholder="https://..."
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </label>

            {form.imageUrl ? (
              <div className="overflow-hidden rounded-lg border border-zinc-200 sm:col-span-2 dark:border-zinc-700">
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
            ) : null}

            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.isAvailable}
                onChange={(e) => setForm((f) => ({ ...f, isAvailable: e.target.checked }))}
                className="rounded border-zinc-300"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Available on menu</span>
            </label>

            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {translate("menuItemRoute")}
              </span>
              <select
                value={selectedRoute}
                onChange={(e) => {
                  const routing = menuItemInputFromRoute(e.target.value as MenuItemRoute);
                  setForm((f) => ({ ...f, ...routing }));
                }}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="kitchen">{translate("menuItemRouteKitchen")}</option>
                <option value="bar">{translate("menuItemRouteBar")}</option>
                <option value="none">{translate("menuItemRouteNone")}</option>
              </select>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                {translate(
                  selectedRoute === "none" ? "menuItemRouteNoneHint" : "menuItemRouteHint",
                )}
              </p>
            </label>
          </div>
        </section>

        <section className="border-t border-zinc-200 pt-4 dark:border-zinc-700">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            3. Options / add-ons
          </p>
          <MenuCustomizationEditor
            value={form.customizationConfig}
            libraryGroups={libraryGroups}
            notePresets={notePresets}
            onChange={(customizationConfig) =>
              setForm((current) => ({ ...current, customizationConfig }))
            }
          />
        </section>
      </div>
    </Modal>
  );
}
