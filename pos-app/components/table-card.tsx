"use client";

import { type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Pencil } from "lucide-react";
import { ElapsedTimer } from "@/components/live-clock";
import type { MenuItem, OrderItem, RestaurantTable } from "@/lib/types";
import { orderItemDisplayName } from "@/lib/menu-display";
import { resolveTableOccupiedSince } from "@/lib/order-item-timers";
import { isTablePaidInProgress } from "@/lib/table-payment";
import { useApp } from "@/contexts/app-context";
import { TABLE_CARD_WIDTH } from "@/lib/table-layout";

function TableTimer({ start }: { start: Date }) {
  return (
    <ElapsedTimer
      start={start}
      className="rounded-md bg-black/10 px-2 py-0.5 font-mono text-xs font-semibold text-gray-900 dark:bg-white/10 dark:text-gray-100"
    />
  );
}

const statusStyles = {
  empty:
    "border-gray-300/70 bg-gray-50 hover:border-gray-400 dark:border-gray-700/80 dark:bg-gray-900/70 dark:hover:border-gray-600",
  waiting:
    "border-amber-400/90 bg-amber-50/90 hover:border-amber-400 dark:border-amber-500/80 dark:bg-amber-950/50 table-glow-waiting",
  ready:
    "border-emerald-400/90 bg-emerald-50/90 hover:border-emerald-400 dark:border-emerald-500/80 dark:bg-emerald-950/45 table-glow-ready",
} as const;

interface TableCardProps {
  table: RestaurantTable;
  menuItems?: MenuItem[];
  orderItems?: OrderItem[];
  slaAlert?: boolean;
  editMode?: boolean;
  compact?: boolean;
  style?: CSSProperties;
  onClick?: () => void;
  onEdit?: () => void;
  onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
}

export function TableCard({
  table,
  menuItems = [],
  orderItems = [],
  slaAlert = false,
  editMode = false,
  compact = false,
  style,
  onClick,
  onEdit,
  onPointerDown,
}: TableCardProps) {
  const { translate, language } = useApp();
  const isRound = table.shape === "round";
  const isPaidInProgress = isTablePaidInProgress(table);
  const displayOrders =
    orderItems.length > 0 ? orderItems : (table.orders ?? []);
  const occupiedSince = resolveTableOccupiedSince(table, displayOrders);

  const cardClassName = `flex h-full w-full flex-col border p-2.5 text-left shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 sm:p-3 ${
    compact ? "min-h-[100px] max-h-none rounded-xl" : "min-h-[120px] max-h-[176px] rounded-xl"
  } ${isRound && !compact ? "aspect-square max-h-[140px] items-center justify-center text-center rounded-full" : ""} ${statusStyles[table.status]} ${
    isPaidInProgress ? "ring-2 ring-emerald-500/70" : ""
  } ${slaAlert ? "sla-alert-pulse" : ""} ${
    editMode ? "cursor-grab ring-2 ring-blue-400 ring-offset-2 active:cursor-grabbing" : "hover:shadow-md"
  } ${table.type === "special" ? "ring-1 ring-inset ring-gray-300/60 dark:ring-gray-600/60" : ""}`;

  const content = (
    <>
      <div className={`flex w-full shrink-0 items-start justify-between gap-2 ${isRound ? "flex-col items-center" : ""}`}>
        <div>
          <span className={`font-bold tracking-tight text-gray-900 dark:text-gray-100 ${compact ? "text-lg sm:text-xl" : "text-xl sm:text-2xl"}`}>
            {table.label}
          </span>
          {table.type === "special" && (
            <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-gray-500 sm:px-2 sm:text-[10px] dark:bg-gray-800 dark:text-gray-400">
              VIP
            </span>
          )}
        </div>
        {occupiedSince && <TableTimer start={occupiedSince} />}
      </div>

      {table.status !== "empty" && displayOrders.length > 0 && (
        <ul
          className={`mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto border-t border-black/5 pt-2 dark:border-white/10 ${
            isRound ? "max-h-12 text-center" : "max-h-16"
          }`}
        >
          {displayOrders.map((item, index) => (
            <li
              key={item.id ?? `${table.id}-${index}-${item.menuItemId ?? "x"}-${item.name}-${item.notes ?? ""}`}
              className="flex items-center justify-between gap-1 truncate text-xs text-gray-800 dark:text-gray-200"
            >
              <span className="min-w-0 truncate">
                {orderItemDisplayName(item, menuItems, language)}{" "}
                <span className="font-semibold">{item.quantity}x</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {table.status === "empty" && (
        <p className="mt-auto shrink-0 pt-2 text-xs font-medium text-gray-500 dark:text-gray-400">
          {translate("available")}
        </p>
      )}
      {table.status !== "empty" && isPaidInProgress && (
        <p className="mt-auto shrink-0 pt-1">
          <span className="inline-flex rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {translate("paidBadge")}
          </span>
        </p>
      )}
      {table.status === "waiting" && !isPaidInProgress && (
        <p className="mt-auto shrink-0 pt-1 text-xs font-semibold text-amber-600 dark:text-amber-300">
          {translate("preparing")}
        </p>
      )}
      {table.status === "ready" && !isPaidInProgress && (
        <p className="mt-auto shrink-0 pt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
          {translate("ready")}
        </p>
      )}
    </>
  );

  if (editMode) {
    return (
      <div
        style={compact ? undefined : { width: TABLE_CARD_WIDTH, ...style }}
        onPointerDown={compact ? undefined : onPointerDown}
        className={`relative ${compact ? "" : "touch-none select-none"}`}
      >
        {onEdit && (
          <button
            type="button"
            aria-label={translate("editTableSettings")}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
            className="absolute -right-2 -top-2 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-blue-200 bg-white text-blue-600 shadow-md hover:bg-blue-50 dark:border-blue-800 dark:bg-gray-900 dark:text-blue-300 dark:hover:bg-blue-950"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        <div className={cardClassName}>{content}</div>
      </div>
    );
  }

  if (compact && onClick) {
    return (
      <button type="button" onClick={onClick} className={cardClassName}>
        {content}
      </button>
    );
  }

  return (
    <button
      type="button"
      style={compact ? undefined : { width: TABLE_CARD_WIDTH, ...style }}
      onClick={onClick}
      className={cardClassName}
    >
      {content}
    </button>
  );
}
