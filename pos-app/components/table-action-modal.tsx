"use client";

import { CreditCard, Plus } from "lucide-react";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";

interface TableActionModalProps {
  open: boolean;
  tableLabel: string;
  onClose: () => void;
  onAddItems: () => void;
  onCheckout: () => void;
}

export function TableActionModal({
  open,
  tableLabel,
  onClose,
  onAddItems,
  onCheckout,
}: TableActionModalProps) {
  const { translate } = useApp();

  return (
    <Modal open={open} onClose={onClose} title={`Table ${tableLabel}`}>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        This table has an active order. What would you like to do?
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onAddItems}
          className="flex flex-col items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 p-5 transition-colors hover:bg-orange-100 dark:border-orange-900 dark:bg-orange-950/50 dark:hover:bg-orange-950"
        >
          <Plus className="h-6 w-6 text-orange-600 dark:text-orange-400" />
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            {translate("addItems")}
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Add more dishes to this table
          </span>
        </button>
        <button
          type="button"
          onClick={onCheckout}
          className="flex flex-col items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-5 transition-colors hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/50 dark:hover:bg-emerald-950"
        >
          <CreditCard className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            {translate("checkout")}
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Pay and close the table
          </span>
        </button>
      </div>
    </Modal>
  );
}
