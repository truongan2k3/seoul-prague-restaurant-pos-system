"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import type { TranslationKey } from "@/lib/i18n/translations";

const QUICK_REASON_KEYS = [
  "cancelReasonGuestChanged",
  "cancelReasonOutOfStock",
  "cancelReasonWrongItem",
  "cancelReasonOther",
] as const satisfies readonly TranslationKey[];

interface CancelReasonModalProps {
  open: boolean;
  itemCount: number;
  translate: (key: TranslationKey) => string;
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
  const [quickKey, setQuickKey] = useState<(typeof QUICK_REASON_KEYS)[number]>(
    "cancelReasonGuestChanged",
  );

  const quickLabel = translate(quickKey);

  const handleClose = () => {
    setReason("");
    setQuickKey("cancelReasonGuestChanged");
    onClose();
  };

  const resolvedReason = (reason.trim() || quickLabel).trim();

  const handleConfirm = async () => {
    if (!resolvedReason) return;
    await onConfirm(resolvedReason);
    setReason("");
    setQuickKey("cancelReasonGuestChanged");
  };

  const labels = useMemo(
    () => QUICK_REASON_KEYS.map((key) => ({ key, label: translate(key) })),
    [translate],
  );

  return (
    <Modal open={open} onClose={handleClose} title={translate("cancelReason")} size="lg">
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
        {itemCount} {itemCount === 1 ? "item" : "items"}
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        {labels.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setQuickKey(key);
              if (key !== "cancelReasonOther") setReason("");
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              quickKey === key
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
          setQuickKey("cancelReasonOther");
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
