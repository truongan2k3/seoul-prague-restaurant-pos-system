"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { InventoryFormModal } from "@/components/inventory-form-modal";
import { useApp } from "@/contexts/app-context";
import { usePinGate } from "@/contexts/pin-gate-context";
import type { InventoryItem } from "@/lib/types";
import {
  createInventoryItem,
  deleteInventoryItem,
  updateInventoryItem,
  type InventoryInput,
} from "@/src/lib/inventory-actions";

interface InventoryManagerProps {
  title: string;
  items: InventoryItem[];
  onChange: () => void;
  defaultCategory: InventoryItem["category"];
}

export function InventoryManager({
  title,
  items,
  onChange,
  defaultCategory,
}: InventoryManagerProps) {
  const { translate, logAction } = useApp();
  const { requestPin } = usePinGate();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (input: InventoryInput) => {
    setIsSaving(true);
    setError(null);
    const payload = { ...input, category: defaultCategory };
    const result = editing
      ? await updateInventoryItem(editing.id, payload)
      : await createInventoryItem(payload);
    setIsSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    logAction(editing ? "update inventory" : "create inventory", input.name);
    setFormOpen(false);
    setEditing(null);
    onChange();
  };

  const handleDelete = (item: InventoryItem) => {
    requestPin(async () => {
      setIsSaving(true);
      const { error: deleteError } = await deleteInventoryItem(item.id);
      setIsSaving(false);
      if (deleteError) {
        setError(deleteError.message);
        return;
      }
      logAction("delete inventory", item.name);
      onChange();
    }, { force: true });
  };

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-semibold">{title}</h2>
        <button
          type="button"
          onClick={() => { setEditing(null); setFormOpen(true); }}
          className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium dark:border-zinc-700"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between rounded-lg border px-3 py-2 dark:border-zinc-800"
          >
            <div>
              <p className="text-sm font-medium">{item.name}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {item.quantity} {item.unit}
                {item.soldOut && ` · ${translate("soldOut")}`}
              </p>
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={() => { setEditing(item); setFormOpen(true); }} className="rounded p-1.5 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => handleDelete(item)} className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <li className="py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">No items yet</li>
        )}
      </ul>

      <InventoryFormModal
        open={formOpen}
        item={editing}
        lockCategory={defaultCategory}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSave={handleSave}
        isSaving={isSaving}
      />
    </section>
  );
}
