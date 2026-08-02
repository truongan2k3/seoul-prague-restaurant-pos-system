"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import type { RestaurantTable } from "@/lib/types";
import { updateTableMetadata } from "@/src/lib/supabase-data";

interface TableEditModalProps {
  open: boolean;
  table: RestaurantTable | null;
  onClose: () => void;
  onSaved: () => void;
}

export function TableEditModal({ open, table, onClose, onSaved }: TableEditModalProps) {
  const { translate, logAction } = useApp();
  const [label, setLabel] = useState("");
  const [isVip, setIsVip] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !table) return;
    setLabel(table.label);
    setIsVip(table.type === "special");
    setError(null);
  }, [open, table]);

  const handleSave = async () => {
    if (!table) return;
    const trimmed = label.trim();
    if (!trimmed) {
      setError(translate("tableLabelRequired"));
      return;
    }

    setIsSaving(true);
    setError(null);

    const { error: saveError } = await updateTableMetadata(table.id, {
      label: trimmed,
      type: isVip ? "special" : "regular",
    });

    setIsSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    logAction("update table", `${table.label} → ${trimmed}${isVip ? " (VIP)" : ""}`);
    onSaved();
    onClose();
  };

  if (!table) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={translate("editTableSettings")}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm dark:border-gray-700"
          >
            {translate("cancel")}
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void handleSave()}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
          >
            {isSaving ? translate("settingsSaving") : translate("save")}
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

        <label className="block">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {translate("tableLabelField")}
          </span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="A1"
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        </label>

        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700">
          <input
            type="checkbox"
            checked={isVip}
            onChange={(e) => setIsVip(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          <div>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {translate("vipTable")}
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400">{translate("vipTableHint")}</p>
          </div>
        </label>
      </div>
    </Modal>
  );
}
