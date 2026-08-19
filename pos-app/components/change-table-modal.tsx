"use client";

import { useMemo } from "react";
import { ArrowRightLeft, GitMerge } from "lucide-react";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import type { RestaurantTable } from "@/lib/types";

interface ChangeTableModalProps {
  open: boolean;
  table: RestaurantTable;
  allTables: RestaurantTable[];
  onClose: () => void;
  onTransfer: (toTableId: string) => void | Promise<void>;
  onMerge: (toTableId: string) => void | Promise<void>;
  isSaving?: boolean;
  error?: string | null;
}

export function ChangeTableModal({
  open,
  table,
  allTables,
  onClose,
  onTransfer,
  onMerge,
  isSaving = false,
  error,
}: ChangeTableModalProps) {
  const { translate } = useApp();

  const targets = useMemo(() => {
    return allTables
      .filter((row) => row.id !== table.id)
      .sort((a, b) => {
        const aEmpty = a.status === "empty" ? 0 : 1;
        const bEmpty = b.status === "empty" ? 0 : 1;
        if (aEmpty !== bEmpty) return aEmpty - bEmpty;
        return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" });
      });
  }, [allTables, table.id]);

  const emptyTargets = targets.filter((row) => row.status === "empty");
  const occupiedTargets = targets.filter((row) => row.status !== "empty");

  const handlePick = (target: RestaurantTable) => {
    if (isSaving) return;
    if (target.status === "empty") {
      void onTransfer(target.id);
      return;
    }
    void onMerge(target.id);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${translate("changeTable")} — ${translate("table")} ${table.label}`}
      size="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">{translate("changeTableHint")}</p>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {targets.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {translate("noOtherTables")}
          </p>
        ) : (
          <div className="space-y-5">
            {emptyTargets.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {translate("available")}
                </h3>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {emptyTargets.map((target) => (
                    <li key={target.id}>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => handlePick(target)}
                        className="flex w-full flex-col items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50/80 px-3 py-3 text-left transition hover:border-emerald-400 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60"
                      >
                        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                          {target.label}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                          {translate("moveToTable")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {occupiedTargets.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {translate("occupiedTables")}
                </h3>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {occupiedTargets.map((target) => (
                    <li key={target.id}>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => handlePick(target)}
                        className="flex w-full flex-col items-start gap-2 rounded-xl border border-amber-300 bg-amber-50/80 px-3 py-3 text-left transition hover:border-amber-400 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:hover:bg-amber-950/60"
                      >
                        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                          {target.label}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-200">
                          <GitMerge className="h-3.5 w-3.5" />
                          {translate("mergeTo")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
