"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import type { InventoryItem } from "@/lib/types";
import type { InventoryInput } from "@/src/lib/inventory-actions";

const emptyForm: InventoryInput = {
  name: "",
  category: "commercial",
  quantity: 0,
  unit: "pcs",
  soldOut: false,
};

interface InventoryFormModalProps {
  open: boolean;
  item?: InventoryItem | null;
  lockCategory?: InventoryItem["category"];
  onClose: () => void;
  onSave: (input: InventoryInput) => Promise<void>;
  isSaving?: boolean;
}

export function InventoryFormModal({
  open,
  item,
  lockCategory,
  onClose,
  onSave,
  isSaving = false,
}: InventoryFormModalProps) {
  const [form, setForm] = useState<InventoryInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (item) {
      setForm({
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        soldOut: item.soldOut,
      });
    } else {
      setForm({ ...emptyForm, category: lockCategory ?? "commercial" });
    }
  }, [open, item, lockCategory]);

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    setError(null);
    await onSave(form);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? "Edit Stock Item" : "Add Stock Item"}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-800 dark:border-gray-600 dark:text-gray-200">
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
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <label className="block">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Name</span>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="pos-input mt-1"
          />
        </label>

        {!lockCategory && (
          <label className="block">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Category</span>
            <select
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({ ...f, category: e.target.value as InventoryItem["category"] }))
              }
              className="pos-input mt-1"
            >
              <option value="commercial">Commercial</option>
              <option value="internal">Internal</option>
            </select>
          </label>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Quantity</span>
            <input
              type="number"
              min={0}
              step={0.1}
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
              className="pos-input mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Unit</span>
            <input
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              className="pos-input mt-1"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.soldOut ?? false}
            onChange={(e) => setForm((f) => ({ ...f, soldOut: e.target.checked }))}
          />
          Sold out
        </label>
      </div>
    </Modal>
  );
}
