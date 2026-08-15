"use client";

import { useRef } from "react";
import { ElapsedTimer } from "@/components/live-clock";
import { WaiterNoteDisplay } from "@/components/waiter-note-display";
import { resolveKitchenStatus } from "@/lib/auto-serve";
import { resolveUnitIds } from "@/lib/order-item-aggregate";
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
  selectedIds?: Set<string>;
  lateIds?: Set<string>;
  onToggle?: (itemId: string) => void;
  onToggleAll?: () => void;
  onMarkReady?: (itemIds: string[]) => void;
  onUndoReady?: (itemIds: string[]) => void;
  onCancelItem?: (itemIds: string[]) => void;
  onAcknowledgeCancel?: (itemIds: string[]) => void;
  variant?: "kitchen" | "bar" | "floor";
  dense?: boolean;
  interactive?: boolean;
}

function itemTimerStart(item: OrderItem): Date | null {
  if (!item.createdAt) return null;
  return new Date(item.createdAt);
}

const LONG_PRESS_MS = 550;

export function OrderItemChecklist({
  items,
  menuItems,
  language,
  translate,
  selectedIds = new Set(),
  lateIds = new Set(),
  onToggle,
  onToggleAll,
  onMarkReady,
  onUndoReady,
  onCancelItem,
  onAcknowledgeCancel,
  variant = "kitchen",
  dense = false,
  interactive = false,
}: OrderItemChecklistProps) {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  if (items.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">{translate("noOrders")}</p>
    );
  }

  const useTapWorkflow = interactive && variant === "kitchen" && Boolean(onMarkReady);
  const allSelected =
    !useTapWorkflow &&
    items.length > 0 &&
    items.every((item) => {
      const ids = resolveUnitIds(item);
      return ids.length > 0 && ids.every((id) => selectedIds.has(id));
    });

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleKitchenPointerDown = (item: OrderItem) => {
    if (!useTapWorkflow) return;
    longPressTriggeredRef.current = false;
    clearLongPressTimer();
    if (!onCancelItem) return;
    const ids = resolveUnitIds(item);
    if (ids.length === 0) return;

    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      onCancelItem(ids);
    }, LONG_PRESS_MS);
  };

  const handleKitchenPointerUp = () => {
    clearLongPressTimer();
  };

  const handleKitchenClick = (item: OrderItem) => {
    const ids = resolveUnitIds(item);
    if (!useTapWorkflow || ids.length === 0 || longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }

    const kitchenStatus = resolveKitchenStatus(item);
    if (kitchenStatus === "cancelled") return;
    if (kitchenStatus === "pending") {
      onMarkReady?.(ids);
    }
  };

  const handleKitchenDoubleClick = (item: OrderItem) => {
    const ids = resolveUnitIds(item);
    if (!useTapWorkflow || ids.length === 0) return;

    longPressTriggeredRef.current = false;

    if (resolveKitchenStatus(item) === "ready") {
      onUndoReady?.(ids);
    }
  };

  const toggleGroup = (item: OrderItem) => {
    for (const id of resolveUnitIds(item)) onToggle?.(id);
  };

  const isGroupSelected = (item: OrderItem) => {
    const ids = resolveUnitIds(item);
    return ids.length > 0 && ids.every((id) => selectedIds.has(id));
  };

  const isGroupLate = (item: OrderItem) =>
    resolveUnitIds(item).some((id) => lateIds.has(id));

  return (
    <div className="space-y-2">
      {!useTapWorkflow && onToggleAll && (
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onToggleAll}
            className="h-4 w-4 rounded border-gray-300"
          />
          Select all
        </label>
      )}

      <ul className={dense ? "space-y-2" : "space-y-3"}>
        {items.map((item, index) => {
          const status = normalizeOrderItemStatus(item.status);
          const kitchenStatus = resolveKitchenStatus(item);
          const { primary, secondary } = orderItemDualDisplay(item, menuItems, language, {
            englishOnly: variant === "bar",
          });
          const isCancelled = kitchenStatus === "cancelled" || Boolean(item.isCancelled);
          const isReady = !isCancelled && (kitchenStatus === "ready" || status === "ready");
          const isServed = !isCancelled && (kitchenStatus === "served" || status === "served");
          const isLate = isGroupLate(item);
          const slaBreached = isItemSlaBreached(item);
          const kitchenDone = variant === "kitchen" && isReady;
          const timerStart = itemTimerStart(item);
          const unitIds = resolveUnitIds(item);
          const rowInteractive =
            useTapWorkflow && unitIds.length > 0 && !isServed && !isCancelled;

          const rowClass = `${
            rowInteractive ? "cursor-pointer select-none active:scale-[0.99]" : ""
          } flex items-start gap-3 rounded-xl border-2 p-3 transition-transform ${
            isCancelled
              ? "border-red-600 bg-red-500 text-white shadow-lg shadow-red-900/30"
              : isServed
                ? "border-slate-300 bg-slate-50 opacity-80 dark:border-slate-600 dark:bg-slate-900/60"
                : isReady
                  ? "border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40"
                  : isLate || slaBreached
                    ? "border-red-400 bg-red-50 dark:border-red-800 dark:bg-red-950/40"
                    : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
          }`;

          const rowBody = (
            <>
              {!useTapWorkflow && !isCancelled && (
                <input
                  type="checkbox"
                  checked={kitchenDone || isGroupSelected(item)}
                  disabled={unitIds.length === 0 || kitchenDone || isServed}
                  onChange={() => toggleGroup(item)}
                  className="mt-1 h-5 w-5 shrink-0 rounded border-gray-300"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold tabular-nums">{item.quantity}×</span>
                  <span
                    className={`text-base font-semibold leading-snug ${
                      kitchenDone || isServed || isCancelled ? "line-through opacity-90" : ""
                    }`}
                  >
                    {primary}
                  </span>
                  {timerStart && !isServed && !isReady && !isCancelled && (
                    <ElapsedTimer
                      start={timerStart}
                      className={`rounded px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums ${
                        slaBreached || isLate
                          ? "bg-red-600 text-white"
                          : "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100"
                      }`}
                    />
                  )}
                  {isCancelled && (
                    <span className="rounded bg-white/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
                      CANCELLED
                    </span>
                  )}
                  {isLate && !isCancelled && (
                    <span className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                      {translate("delayed")}
                    </span>
                  )}
                  {!isCancelled && (variant === "kitchen" ? isReady : isReady || isServed) && (
                    <span className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                      {translate(isServed ? "served" : "done")}
                    </span>
                  )}
                </div>
                {secondary && (
                  <p
                    className={`mt-0.5 text-sm ${
                      isCancelled ? "text-white/80" : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {secondary}
                  </p>
                )}
                {isCancelled && item.cancelReason && (
                  <p className="mt-1 text-sm font-medium text-white/90">
                    {item.cancelReason}
                  </p>
                )}
                {!isCancelled &&
                  (variant === "kitchen" ? (
                    <WaiterNoteDisplay notes={item.notes} notesTranslated={item.notesTranslated} />
                  ) : (
                    item.notes && (
                      <p className="mt-1 text-sm font-medium italic text-red-700 dark:text-red-300">
                        {item.notes}
                      </p>
                    )
                  ))}
                {isCancelled && variant === "kitchen" && unitIds.length > 0 && onAcknowledgeCancel && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onAcknowledgeCancel(unitIds);
                    }}
                    className="mt-3 min-h-[44px] w-full rounded-lg bg-white px-3 py-2 text-sm font-black uppercase tracking-wide text-red-700"
                  >
                    {translate("acknowledgeCancel")}
                  </button>
                )}
              </div>
            </>
          );

          if (rowInteractive) {
            return (
              <li key={item.unitIds?.join("-") ?? item.id ?? `${item.name}-${index}`}>
                <button
                  type="button"
                  onClick={() => handleKitchenClick(item)}
                  onDoubleClick={() => handleKitchenDoubleClick(item)}
                  onPointerDown={() => handleKitchenPointerDown(item)}
                  onPointerUp={handleKitchenPointerUp}
                  onPointerLeave={handleKitchenPointerUp}
                  onPointerCancel={handleKitchenPointerUp}
                  className={`${rowClass} w-full text-left`}
                >
                  {rowBody}
                </button>
              </li>
            );
          }

          return (
            <li
              key={item.unitIds?.join("-") ?? item.id ?? `${item.name}-${index}`}
              className={rowClass}
            >
              {rowBody}
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
          className="min-h-[48px] flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-base font-bold uppercase tracking-wide text-white disabled:opacity-40"
        >
          {translate(variant === "floor" ? "markDone" : "done")}
        </button>
      )}
      {showDelay && (
        <button
          type="button"
          disabled={disabled}
          onClick={onLate}
          className="min-h-[48px] flex-1 rounded-xl bg-amber-500 px-4 py-3 text-base font-bold uppercase tracking-wide text-amber-950 disabled:opacity-40"
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
