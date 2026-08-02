"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { MenuItemFormModal } from "@/components/menu-item-form-modal";
import { useApp } from "@/contexts/app-context";
import { usePinGate } from "@/contexts/pin-gate-context";
import { formatPrice } from "@/lib/i18n/translations";
import type { MenuItem } from "@/lib/types";
import {
  createMenuItem,
  deleteMenuItem,
  updateMenuItem,
  updateMenuItemAvailability,
  type MenuItemInput,
} from "@/src/lib/menu-actions";

interface MenuManagerProps {
  menuItems: MenuItem[];
  onChange: () => void;
}

export function MenuManager({ menuItems, onChange }: MenuManagerProps) {
  const { translate, logAction } = useApp();
  const { requestPin } = usePinGate();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return menuItems;

    return menuItems.filter((item) => {
      const haystack = [
        item.id,
        item.nameEn,
        item.nameCz,
        item.nameZh,
        item.category,
        item.descriptionEn ?? "",
        item.descriptionCz ?? "",
        item.descriptionZh ?? "",
        formatPrice(item.price),
        String(item.price),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [menuItems, search]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (item: MenuItem) => {
    setEditing(item);
    setFormOpen(true);
  };

  const handleSave = async (input: MenuItemInput) => {
    setIsSaving(true);
    setError(null);

    const result = editing
      ? await updateMenuItem(editing.id, input)
      : await createMenuItem(input);

    setIsSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    logAction(editing ? "update menu item" : "create menu item", input.nameEn);
    setFormOpen(false);
    setEditing(null);
    onChange();
  };

  const handleDelete = (item: MenuItem) => {
    requestPin(async () => {
      setIsSaving(true);
      const { error: deleteError } = await deleteMenuItem(item.id);
      setIsSaving(false);
      if (deleteError) {
        setError(deleteError.message);
        return;
      }
      logAction("delete menu item", item.nameEn);
      onChange();
    });
  };

  const handleToggleAvailable = async (item: MenuItem) => {
    setIsSaving(true);
    setError(null);
    const next = !item.isAvailable;
    const { error: toggleError } = await updateMenuItemAvailability(item.id, next);
    setIsSaving(false);
    if (toggleError) {
      setError(toggleError.message);
      return;
    }
    logAction(next ? "menu item available" : "menu item unavailable", item.nameEn);
    onChange();
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div>
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Menu Management</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {menuItems.length} items · synced with Supabase
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          <Plus className="h-4 w-4" />
          New Item
        </button>
      </div>

      <div className="border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name (EN/CZ/ZH), category, description…"
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
      </div>

      {error && (
        <p className="mx-6 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950/50">
              <th className="px-6 py-3">Name (EN)</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Available</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-zinc-500 dark:text-zinc-400">
                  {menuItems.length === 0
                    ? "No menu items yet. Click New Item to add one."
                    : "No items match your search."}
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr
                  key={item.id}
                  className={`transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                    !item.isAvailable ? "opacity-60" : ""
                  }`}
                >
                  <td className="px-6 py-3">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{item.nameEn}</p>
                    {(item.nameCz || item.nameZh) && (
                      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        {[item.nameCz, item.nameZh].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {!item.isAvailable && (
                      <span className="text-[10px] font-semibold uppercase text-red-500">
                        {translate("soldOut")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {item.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                    {formatPrice(item.price)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={item.isAvailable}
                      aria-label={`Toggle availability for ${item.nameEn}`}
                      disabled={isSaving}
                      onClick={() => void handleToggleAvailable(item)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition disabled:opacity-50 ${
                        item.isAvailable ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                          item.isAvailable ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="rounded-lg p-2 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                        aria-label={`Edit ${item.nameEn}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        disabled={isSaving}
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950"
                        aria-label={`Delete ${item.nameEn}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <MenuItemFormModal
        open={formOpen}
        item={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSave={handleSave}
        isSaving={isSaving}
      />
    </section>
  );
}
