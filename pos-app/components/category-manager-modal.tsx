"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import type { MenuCategoryRecord } from "@/lib/types";
import {
  countItemsInCategory,
  createCategory,
  deleteCategory,
  updateCategory,
  type CategoryType,
} from "@/src/lib/category-actions";

interface CategoryManagerModalProps {
  open: boolean;
  categories: MenuCategoryRecord[];
  onClose: () => void;
  onChange: () => void;
}

interface DraftCategory {
  id?: string;
  name: string;
  type: CategoryType;
  displayOrder: number;
}

interface DeleteTarget {
  category: MenuCategoryRecord;
  itemCount: number;
}

export function CategoryManagerModal({
  open,
  categories,
  onClose,
  onChange,
}: CategoryManagerModalProps) {
  const { translate } = useApp();
  const [drafts, setDrafts] = useState<DraftCategory[]>([]);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<CategoryType>("dish");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<CategoryType>("dish");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDrafts(
      categories.map((category) => ({
        id: category.id,
        name: category.name,
        type: category.type,
        displayOrder: category.displayOrder,
      })),
    );
    setNewName("");
    setNewType("dish");
    setEditingId(null);
    setDeleteTarget(null);
    setError(null);
  }, [open, categories]);

  const grouped = useMemo(() => {
    const dish = drafts.filter((c) => c.type === "dish");
    const drink = drafts.filter((c) => c.type === "drink");
    return { dish, drink };
  }, [drafts]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      setError(translate("categoryNameRequired"));
      return;
    }

    setIsSaving(true);
    setError(null);
    const { error: createError } = await createCategory({
      name,
      type: newType,
      displayOrder: drafts.length,
    });
    setIsSaving(false);

    if (createError) {
      setError(createError.message);
      return;
    }

    setNewName("");
    setNewType("dish");
    onChange();
  };

  const startEdit = (category: DraftCategory) => {
    if (!category.id) return;
    setEditingId(category.id);
    setEditName(category.name);
    setEditType(category.type);
    setError(null);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) {
      setError(translate("categoryNameRequired"));
      return;
    }

    const existing = drafts.find((c) => c.id === editingId);
    if (!existing) return;

    setIsSaving(true);
    setError(null);
    const { error: updateError } = await updateCategory(editingId, {
      name,
      type: editType,
      displayOrder: existing.displayOrder,
    });
    setIsSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setEditingId(null);
    onChange();
  };

  const requestDelete = async (category: DraftCategory) => {
    if (!category.id) return;

    setIsSaving(true);
    const { count, error: countError } = await countItemsInCategory(category.id);
    setIsSaving(false);

    if (countError) {
      setError(countError.message);
      return;
    }

    setDeleteTarget({
      category: {
        id: category.id,
        name: category.name,
        type: category.type,
        displayOrder: category.displayOrder,
      },
      itemCount: count,
    });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    setIsSaving(true);
    setError(null);
    const { error: deleteError } = await deleteCategory(deleteTarget.category.id);
    setIsSaving(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setDeleteTarget(null);
    onChange();
  };

  const renderGroup = (title: string, items: DraftCategory[]) => (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700">
      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400">
        {title}
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">{translate("noCategoriesYet")}</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {items.map((category) => (
            <li key={category.id ?? category.name} className="flex items-center gap-3 px-4 py-3">
              {editingId === category.id ? (
                <>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  />
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as CategoryType)}
                    className="rounded-lg border border-zinc-200 px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    <option value="dish">{translate("filterDish")}</option>
                    <option value="drink">{translate("filterDrink")}</option>
                  </select>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void handleSaveEdit()}
                    className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    {translate("save")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-700"
                  >
                    {translate("cancel")}
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 font-medium text-zinc-900 dark:text-zinc-100">
                    {category.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => startEdit(category)}
                    className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    aria-label={`Edit ${category.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void requestDelete(category)}
                    className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950"
                    aria-label={`Delete ${category.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        title={translate("manageCategories")}
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-700"
            >
              {translate("close")}
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

          <div className="grid gap-4 md:grid-cols-2">
            {renderGroup(translate("filterDish"), grouped.dish)}
            {renderGroup(translate("filterDrink"), grouped.drink)}
          </div>

          <div className="rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-600">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {translate("newCategory")}
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={translate("categoryName")}
                className="min-w-[180px] flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as CategoryType)}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="dish">{translate("filterDish")}</option>
                <option value="drink">{translate("filterDrink")}</option>
              </select>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleCreate()}
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                <Plus className="h-4 w-4" />
                {translate("addCategory")}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        title={translate("deleteCategory")}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-700"
            >
              {translate("cancel")}
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void confirmDelete()}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {translate("confirm")}
            </button>
          </div>
        }
      >
        {deleteTarget && (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            {deleteTarget.itemCount > 0
              ? translate("deleteCategoryWithItems").replace(
                  "{count}",
                  String(deleteTarget.itemCount),
                ).replace("{name}", deleteTarget.category.name)
              : translate("deleteCategoryConfirm").replace("{name}", deleteTarget.category.name)}
          </p>
        )}
      </Modal>
    </>
  );
}
