"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { GripVertical, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { MenuItemFormModal } from "@/components/menu-item-form-modal";
import { useApp } from "@/contexts/app-context";
import { usePinGate } from "@/contexts/pin-gate-context";
import {
  categoriesForOrdering,
  filterMenuItems,
  reorderFilteredItems,
  resolveItemCategoryName,
  type ItemTypeFilter,
} from "@/lib/category-utils";
import { formatPrice } from "@/lib/i18n/translations";
import { filterButtonClass } from "@/lib/theme-classes";
import type { MenuCategoryRecord, MenuItem } from "@/lib/types";
import {
  createMenuItem,
  deleteMenuItem,
  updateMenuItem,
  updateMenuItemAvailability,
  updateMenuSortOrders,
  type MenuItemInput,
} from "@/src/lib/menu-actions";

interface MenuManagerProps {
  menuItems: MenuItem[];
  categories: MenuCategoryRecord[];
  onChange: () => void;
}

export function MenuManager({ menuItems, categories, onChange }: MenuManagerProps) {
  const { translate, logAction } = useApp();
  const { requestPin } = usePinGate();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ItemTypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [localItems, setLocalItems] = useState(menuItems);
  const [isMobileList, setIsMobileList] = useState(false);

  useEffect(() => {
    setLocalItems(menuItems);
  }, [menuItems]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobileList(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const orderedCategories = useMemo(() => categoriesForOrdering(categories), [categories]);

  const filteredItems = useMemo(
    () =>
      filterMenuItems(localItems, orderedCategories, {
        search,
        typeFilter,
        categoryFilter,
      }),
    [localItems, orderedCategories, search, typeFilter, categoryFilter],
  );

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

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    if (result.source.index === result.destination.index) return;

    const nextAll = reorderFilteredItems(
      localItems,
      filteredItems,
      result.source.index,
      result.destination.index,
    );

    setLocalItems(nextAll);

    const changed = nextAll.filter((item) => {
      const previous = menuItems.find((prev) => prev.id === item.id);
      return previous && previous.sortOrder !== item.sortOrder;
    });

    if (changed.length === 0) return;

    setIsSaving(true);
    const { error: reorderError } = await updateMenuSortOrders(
      changed.map((item) => ({ id: item.id, sortOrder: item.sortOrder })),
    );
    setIsSaving(false);

    if (reorderError) {
      setError(reorderError.message);
      setLocalItems(menuItems);
      return;
    }

    logAction("reorder menu items", `${changed.length} items`);
    onChange();
  };

  const typeTabs: { id: ItemTypeFilter; label: string }[] = [
    { id: "all", label: translate("filterAll") },
    { id: "dish", label: translate("filterDish") },
    { id: "drink", label: translate("filterDrink") },
  ];

  return (
    <section className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div>
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Menu Management</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {menuItems.length} items · {translate("dragToReorder")}
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

      <div className="flex flex-col gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-wrap gap-2">
          {typeTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTypeFilter(tab.id)}
              className={`min-h-[44px] rounded-full px-3 py-1.5 text-xs font-semibold ${filterButtonClass(typeFilter === tab.id)}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name (EN/CZ/ZH), category, description…"
            className="min-h-[44px] w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
      </div>

      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:px-6">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="shrink-0 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {translate("filterByCategory")}:
          </span>
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${filterButtonClass(categoryFilter === "all")}`}
          >
            {translate("filterAll")}
          </button>
          {orderedCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setCategoryFilter(category.id)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${filterButtonClass(categoryFilter === category.id)}`}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mx-6 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <DragDropContext onDragEnd={(result) => void handleDragEnd(result)}>
          {!isMobileList ? (
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
                <th className="w-10 px-3 py-3" aria-label={translate("dragToReorder")} />
                <th className="px-4 py-3">Name (EN)</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Available</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <Droppable droppableId="menu-items">
              {(provided) => (
                <tbody
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="divide-y divide-zinc-100 dark:divide-zinc-800"
                >
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-zinc-500 dark:text-zinc-400">
                        {menuItems.length === 0
                          ? "No menu items yet. Click New Item to add one."
                          : "No items match your filters."}
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item, index) => {
                      const categoryLabel = resolveItemCategoryName(item, orderedCategories);
                      return (
                        <Draggable key={item.id} draggableId={item.id} index={index}>
                          {(dragProvided, snapshot) => (
                            <tr
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              className={`transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                                !item.isAvailable ? "opacity-60" : ""
                              } ${snapshot.isDragging ? "bg-zinc-100 shadow-lg dark:bg-zinc-800" : ""}`}
                            >
                              <td className="px-3 py-3">
                                <button
                                  type="button"
                                  {...dragProvided.dragHandleProps}
                                  className="touch-action-none cursor-grab rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 active:cursor-grabbing dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                                  aria-label={`${translate("dragToReorder")}: ${item.nameEn}`}
                                >
                                  <GripVertical className="h-4 w-4" />
                                </button>
                              </td>
                              <td className="px-4 py-3">
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
                                  {categoryLabel}
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
                                    className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
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
                          )}
                        </Draggable>
                      );
                    })
                  )}
                  {provided.placeholder}
                </tbody>
              )}
            </Droppable>
          </table>
          ) : (
          <Droppable droppableId="menu-items-mobile">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="space-y-3 p-4"
              >
                {filteredItems.length === 0 ? (
                  <p className="py-8 text-center text-zinc-500 dark:text-zinc-400">
                    {menuItems.length === 0
                      ? "No menu items yet. Click New Item to add one."
                      : "No items match your filters."}
                  </p>
                ) : (
                  filteredItems.map((item, index) => {
                    const categoryLabel = resolveItemCategoryName(item, orderedCategories);
                    return (
                      <Draggable key={item.id} draggableId={item.id} index={index}>
                        {(dragProvided, snapshot) => (
                          <article
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={`rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900/50 ${
                              snapshot.isDragging ? "shadow-lg ring-2 ring-zinc-300" : ""
                            } ${!item.isAvailable ? "opacity-60" : ""}`}
                          >
                            <div className="flex items-start gap-3">
                              <button
                                type="button"
                                {...dragProvided.dragHandleProps}
                                className="touch-action-none touch-target flex shrink-0 items-center justify-center text-zinc-400"
                                aria-label={`${translate("dragToReorder")}: ${item.nameEn}`}
                              >
                                <GripVertical className="h-5 w-5" />
                              </button>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-zinc-900 dark:text-zinc-100">{item.nameEn}</p>
                                <p className="mt-1 text-xs text-zinc-500">{categoryLabel}</p>
                                <p className="mt-1 font-semibold tabular-nums">{formatPrice(item.price)}</p>
                              </div>
                              <div className="flex shrink-0 gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEdit(item)}
                                  className="touch-target rounded-lg p-2 text-zinc-500"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(item)}
                                  className="touch-target rounded-lg p-2 text-red-500"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                            <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-3 dark:border-zinc-800">
                              <span className="text-xs text-zinc-500">{translate("available")}</span>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={item.isAvailable}
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
                            </div>
                          </article>
                        )}
                      </Draggable>
                    );
                  })
                )}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
          )}
        </DragDropContext>
      </div>

      <MenuItemFormModal
        open={formOpen}
        item={editing}
        categories={orderedCategories}
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
