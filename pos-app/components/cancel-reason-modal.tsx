"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";

const QUICK_REASONS = ["Khách đổi ý", "Hết đồ", "Nhầm món", "Khác"] as const;

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
  const [quick, setQuick] = useState<string>("Khách đổi ý");

  const handleClose = () => {
    setReason("");
    setQuick("Khách đổi ý");
    onClose();
  };

  const resolvedReason = (reason.trim() || quick).trim();

  const handleConfirm = async () => {
    if (!resolvedReason) return;
    await onConfirm(resolvedReason);
    setReason("");
    setQuick("Khách đổi ý");
  };

  return (
    <Modal open={open} onClose={handleClose} title={translate("cancelReason")} size="lg">
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
        {itemCount} {itemCount === 1 ? "item" : "items"}
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        {QUICK_REASONS.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              setQuick(label);
              if (label !== "Khác") setReason("");
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              quick === label
                ? "bg-red-600 text-white"
                : "border border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <textarea
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
          setQuick("Khác");
        }}
        placeholder={translate("cancelReasonPlaceholder")}
        rows={3}
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
          disabled={isSaving || !resolvedReason}
          onClick={() => void handleConfirm()}
          className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {translate("confirm")}
        </button>
      </div>
    </Modal>
  );
}
