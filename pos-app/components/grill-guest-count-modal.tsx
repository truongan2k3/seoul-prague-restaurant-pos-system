"use client";

import { useEffect, useState } from "react";
import { Minus, Plus, Users } from "lucide-react";
import { Modal } from "@/components/modal";
import type { TranslationKey } from "@/lib/i18n/translations";

interface GrillGuestCountModalProps {
  open: boolean;
  itemLabel?: string;
  translate: (key: TranslationKey) => string;
  onConfirm: (guestCount: number) => void;
  onClose: () => void;
}

export function GrillGuestCountModal({
  open,
  itemLabel,
  translate,
  onConfirm,
  onClose,
}: GrillGuestCountModalProps) {
  const [count, setCount] = useState(2);

  useEffect(() => {
    if (open) setCount(2);
  }, [open]);

  if (!open) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={translate("grillGuestCountTitle")}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold dark:border-gray-700"
          >
            {translate("cancel")}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(count)}
            className="min-h-[44px] flex-1 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white"
          >
            {translate("confirm")}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">{translate("grillGuestCountHint")}</p>
        {itemLabel && (
          <p className="rounded-lg bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-900 dark:bg-orange-950/40 dark:text-orange-100">
            {itemLabel}
          </p>
        )}

        <div className="flex items-center justify-center gap-4 py-2">
          <button
            type="button"
            onClick={() => setCount((value) => Math.max(1, value - 1))}
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 text-gray-800 dark:border-gray-700 dark:text-gray-100"
            aria-label="Decrease guests"
          >
            <Minus className="h-5 w-5" />
          </button>
          <div className="flex min-w-[120px] flex-col items-center">
            <Users className="mb-1 h-6 w-6 text-orange-600" />
            <span className="text-4xl font-black tabular-nums text-gray-900 dark:text-gray-100">{count}</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {translate("grillGuestCountLabel")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCount((value) => Math.min(30, value + 1))}
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 text-gray-800 dark:border-gray-700 dark:text-gray-100"
            aria-label="Increase guests"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>
    </Modal>
  );
}
