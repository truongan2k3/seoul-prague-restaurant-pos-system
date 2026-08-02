"use client";

import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { ElapsedTimer } from "@/components/live-clock";
import type { MenuItem, OrderItem, RestaurantTable } from "@/lib/types";
import { orderItemDisplayName } from "@/lib/menu-display";
import { normalizeOrderItemStatus } from "@/lib/order-status";
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
    "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600",
  waiting:
    "border-orange-200 bg-orange-50 hover:border-orange-300 dark:border-orange-900 dark:bg-orange-950/40",
  ready:
    "border-emerald-200 bg-emerald-50 hover:border-emerald-300 dark:border-emerald-900 dark:bg-emerald-950/40",
} as const;

interface TableCardProps {
  table: RestaurantTable;
  menuItems?: MenuItem[];
  orderItems?: OrderItem[];
  dimmed?: boolean;
  slaAlert?: boolean;
  editMode?: boolean;
  style?: CSSProperties;
  onClick?: () => void;
  onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
}

export function TableCard({
  table,
  menuItems = [],
  orderItems = [],
  dimmed = false,
  slaAlert = false,
  editMode = false,
  style,
  onClick,
  onPointerDown,
}: TableCardProps) {
  const { translate, language } = useApp();
  const isRound = table.shape === "round";
  const displayOrders =
    orderItems.length > 0 ? orderItems : (table.orders ?? []);
  const oldestActiveItem = displayOrders
    .filter((item) => item.createdAt && normalizeOrderItemStatus(item.status) !== "served")
    .sort(
      (a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime(),
    )[0];
  const showTimer = oldestActiveItem?.createdAt;

  const cardClassName = `flex h-full min-h-[120px] max-h-[176px] w-full flex-col border p-3 text-left shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 ${
    isRound ? "rounded-full aspect-square max-h-[140px] items-center justify-center text-center" : "rounded-xl"
  } ${statusStyles[table.status]} ${slaAlert ? "sla-alert-pulse" : ""} ${dimmed ? "opacity-30" : "opacity-100"} ${
    editMode ? "cursor-grab ring-2 ring-blue-400 ring-offset-2 active:cursor-grabbing" : "hover:shadow-md"
  } ${table.type === "special" ? "ring-1 ring-inset ring-gray-300/60 dark:ring-gray-600/60" : ""}`;

  const content = (
    <>
      <div className={`flex w-full shrink-0 items-start justify-between gap-2 ${isRound ? "flex-col items-center" : ""}`}>
        <div>
          <span className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            {table.label}
          </span>
          {table.type === "special" && (
            <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              VIP
            </span>
          )}
        </div>
        {showTimer && oldestActiveItem?.createdAt && (
          <TableTimer start={new Date(oldestActiveItem.createdAt)} />
        )}
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
              {item.createdAt && normalizeOrderItemStatus(item.status) !== "served" && (
                <ElapsedTimer
                  start={new Date(item.createdAt)}
                  className="shrink-0 font-mono text-[10px] font-semibold tabular-nums text-orange-700 dark:text-orange-300"
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {table.status === "empty" && (
        <p className="mt-auto shrink-0 pt-2 text-xs font-medium text-gray-500 dark:text-gray-400">
          {translate("available")}
        </p>
      )}
      {table.status === "waiting" && (
        <p className="mt-auto shrink-0 pt-1 text-xs font-medium text-orange-600 dark:text-orange-400">
          {translate("waiting")}
        </p>
      )}
      {table.status === "ready" && (
        <p className="mt-auto shrink-0 pt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          {translate("ready")}
        </p>
      )}
    </>
  );

  if (editMode) {
    return (
      <div
        style={{ width: TABLE_CARD_WIDTH, ...style }}
        onPointerDown={onPointerDown}
        className="touch-none select-none"
      >
        <div className={cardClassName}>{content}</div>
      </div>
    );
  }

  return (
    <button
      type="button"
      style={{ width: TABLE_CARD_WIDTH, ...style }}
      onClick={onClick}
      className={cardClassName}
    >
      {content}
    </button>
  );
}
