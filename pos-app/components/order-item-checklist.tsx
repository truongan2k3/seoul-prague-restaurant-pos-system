"use client";

import { ElapsedTimer } from "@/components/live-clock";
import { WaiterNoteDisplay } from "@/components/waiter-note-display";
import { orderItemDualDisplay } from "@/lib/menu-display";
import { isItemSlaBreached } from "@/lib/order-sla";
import { normalizeOrderItemStatus } from "@/lib/order-status";
import type { LanguageCode, MenuItem, OrderItem } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n/translations";

interface OrderItemChecklistProps {
  items: OrderItem[];
  menuItems: MenuItem[];
  language: LanguageCode;
  translate: (key: TranslationKey) => string;
  selectedIds: Set<string>;
  lateIds: Set<string>;
  onToggle: (itemId: string) => void;
  onToggleAll: () => void;
  variant?: "kitchen" | "floor";
  dense?: boolean;
}

function itemTimerStart(item: OrderItem): Date | null {
  if (!item.createdAt) return null;
  return new Date(item.createdAt);
}

export function OrderItemChecklist({
  items,
  menuItems,
  language,
  translate,
  selectedIds,
  lateIds,
  onToggle,
  onToggleAll,
  variant = "kitchen",
  dense = false,
}: OrderItemChecklistProps) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">{translate("noOrders")}</p>
    );
  }

  const allSelected = items.length > 0 && items.every((item) => item.id && selectedIds.has(item.id));

  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
          className="h-4 w-4 rounded border-gray-300"
        />
        Select all
      </label>
      <ul className={dense ? "space-y-2" : "space-y-3"}>
        {items.map((item, index) => {
          const status = normalizeOrderItemStatus(item.status);
          const { primary, secondary } = orderItemDualDisplay(item, menuItems, language);
          const isReady = status === "ready";
          const isServed = status === "served";
          const isLate = item.id ? lateIds.has(item.id) : false;
          const slaBreached = isItemSlaBreached(item);
          const kitchenDone = variant === "kitchen" && isReady;
          const timerStart = itemTimerStart(item);

          return (
            <li
              key={item.id ?? `${item.name}-${index}`}
              className={`flex items-start gap-3 rounded-xl border-2 p-3 ${
                isServed
                  ? "border-slate-300 bg-slate-50 opacity-80 dark:border-slate-600 dark:bg-slate-900/60"
                  : isReady
                    ? "border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40"
                    : isLate || slaBreached
                      ? "border-red-400 bg-red-50 dark:border-red-800 dark:bg-red-950/40"
                      : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
              }`}
            >
              <input
                type="checkbox"
                checked={kitchenDone || (item.id ? selectedIds.has(item.id) : false)}
                disabled={!item.id || kitchenDone || isServed}
                onChange={() => item.id && onToggle(item.id)}
                className="mt-1 h-5 w-5 shrink-0 rounded border-gray-300"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold tabular-nums">{item.quantity}×</span>
                  <span
                    className={`text-base font-semibold leading-snug ${
                      kitchenDone || isServed ? "line-through opacity-70" : ""
                    }`}
                  >
                    {primary}
                  </span>
                  {timerStart && !isServed && (
                    <ElapsedTimer
                      start={timerStart}
                      className={`rounded px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums ${
                        slaBreached || isLate
                          ? "bg-red-600 text-white"
                          : "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100"
                      }`}
                    />
                  )}
                  {isLate && (
                    <span className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                      {translate("delayed")}
                    </span>
                  )}
                  {(variant === "kitchen" ? isReady : isReady || isServed) && (
                    <span className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                      {translate(isServed ? "served" : "ready")}
                    </span>
                  )}
                </div>
                {secondary && (
                  <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{secondary}</p>
                )}
                {variant === "kitchen" ? (
                  <WaiterNoteDisplay
                    notes={item.notes}
                    notesTranslated={item.notesTranslated}
                  />
                ) : (
                  item.notes && (
                    <p className="mt-1 text-sm font-medium italic text-red-700 dark:text-red-300">
                      {item.notes}
                    </p>
                  )
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface TicketActionBarProps {
  translate: (key: TranslationKey) => string;
  onDone: () => void;
  onLate: () => void;
  onCancel: () => void;
  disabled?: boolean;
  variant?: "kitchen" | "floor";
  showCancel?: boolean;
  showMarkServed?: boolean;
  showDelay?: boolean;
}

export function TicketActionBar({
  translate,
  onDone,
  onLate,
  onCancel,
  disabled = false,
  variant = "kitchen",
  showCancel = true,
  showMarkServed = true,
  showDelay = true,
}: TicketActionBarProps) {
  const showAnyAction = showMarkServed || showDelay || showCancel;
  if (!showAnyAction) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {showMarkServed && (
        <button
          type="button"
          disabled={disabled}
          onClick={onDone}
          className="min-h-[44px] flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white disabled:opacity-40"
        >
          {translate(variant === "floor" ? "markDone" : "done")}
        </button>
      )}
      {showDelay && (
        <button
          type="button"
          disabled={disabled}
          onClick={onLate}
          className="min-h-[44px] flex-1 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-amber-950 disabled:opacity-40"
        >
          {translate("delay")}
        </button>
      )}
      {showCancel && (
        <button
          type="button"
          disabled={disabled}
          onClick={onCancel}
          className="min-h-[44px] flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white disabled:opacity-40"
        >
          {translate("cancel")}
        </button>
      )}
    </div>
  );
}
