"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";

interface CancelReasonModalProps {
  open: boolean;
  itemCount: number;
  translate: (key: import("@/lib/i18n/translations").TranslationKey) => string;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
  isSaving?: boolean;
}

export function CancelReasonModal({
  open,
  itemCount,
  translate,
  onClose,
  onConfirm,
  isSaving = false,
}: CancelReasonModalProps) {
  const [reason, setReason] = useState("");

  const handleClose = () => {
    setReason("");
    onClose();
  };

  const handleConfirm = async () => {
    const trimmed = reason.trim();
    if (!trimmed) return;
    await onConfirm(trimmed);
    setReason("");
  };

  return (
    <Modal open={open} onClose={handleClose} title={translate("cancelReason")} size="lg">
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
        {itemCount} {itemCount === 1 ? "item" : "items"}
      </p>
      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder={translate("cancelReasonPlaceholder")}
        rows={4}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      />
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={handleClose}
          disabled={isSaving}
          className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium dark:border-gray-700"
        >
          {translate("cancel")}
        </button>
        <button
          type="button"
          disabled={isSaving || !reason.trim()}
          onClick={() => void handleConfirm()}
          className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {translate("confirm")}
        </button>
      </div>
    </Modal>
  );
}
