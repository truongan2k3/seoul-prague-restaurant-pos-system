"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/app-context";
import { MAX_RESERVATION_TABLES, normalizeReservationTableIds } from "@/lib/reservation-tables";
import type { RestaurantTable, TableStatus } from "@/lib/types";

const TABLE_STATUS_LABEL_KEYS: Record<TableStatus, "empty" | "waiting" | "ready"> = {
  empty: "empty",
  waiting: "waiting",
  ready: "ready",
};

function tableGroups(tables: RestaurantTable[]) {
  const empty = tables.filter((table) => table.status === "empty");
  const occupied = tables.filter((table) => table.status !== "empty");
  return { empty, occupied };
}

interface ReservationTableSelectProps {
  tables: RestaurantTable[];
  value: string;
  onChange: (tableId: string) => void;
  className?: string;
  includeAnyTable?: boolean;
  /** Exclude these table ids from the options (e.g. the other multi-table picks). */
  excludeIds?: string[];
}

export function ReservationTableSelect({
  tables,
  value,
  onChange,
  className = "pos-input",
  includeAnyTable = true,
  excludeIds = [],
}: ReservationTableSelectProps) {
  const { translate } = useApp();
  const excluded = new Set(excludeIds.filter(Boolean));
  const filtered = tables.filter((table) => !excluded.has(table.id) || table.id === value);
  const { empty, occupied } = tableGroups(filtered);

  const renderOption = (table: RestaurantTable) => {
    const statusKey = TABLE_STATUS_LABEL_KEYS[table.status];
    return (
      <option key={table.id} value={table.id}>
        {translate("table")} {table.label} · {translate(statusKey)}
      </option>
    );
  };

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      {includeAnyTable ? <option value="">{translate("selectTable")}</option> : null}
      {empty.length > 0 ? (
        <optgroup label={translate("resTablesEmptyGroup")}>{empty.map(renderOption)}</optgroup>
      ) : null}
      {occupied.length > 0 ? (
        <optgroup label={translate("resTablesOccupiedGroup")}>{occupied.map(renderOption)}</optgroup>
      ) : null}
    </select>
  );
}

const SLOT_LABEL_KEYS = ["selectTable", "selectSecondTable", "selectThirdTable"] as const;

/** Pick up to 3 tables for large-party assign / check-in. Starts with 1 slot. */
export function ReservationDualTableSelect({
  tables,
  value,
  onChange,
  className = "pos-input",
}: {
  tables: RestaurantTable[];
  value: string[];
  onChange: (tableIds: string[]) => void;
  className?: string;
}) {
  const { translate } = useApp();
  const ids = normalizeReservationTableIds(value);
  const [slotCount, setSlotCount] = useState(() => Math.max(1, ids.length));

  useEffect(() => {
    if (ids.length === 0) {
      setSlotCount(1);
      return;
    }
    setSlotCount((current) => Math.max(current, ids.length));
  }, [ids.length]);

  const slots = Array.from({ length: slotCount }, (_, index) => ids[index] ?? "");

  const setAt = (index: number, tableId: string) => {
    const next = Array.from({ length: slotCount }, (_, i) => (i === index ? tableId : slots[i] ?? ""));
    onChange(normalizeReservationTableIds(next));
  };

  const canAdd = slotCount < MAX_RESERVATION_TABLES;
  const canRemoveLast =
    slotCount > 1 && !(slots[slotCount - 1] ?? "") && slotCount > Math.max(1, ids.length);

  return (
    <div className="space-y-2">
      {slots.map((tableId, index) => {
        const excludeIds = slots.filter((_, i) => i !== index && slots[i]);
        const labelKey = SLOT_LABEL_KEYS[index] ?? "selectTable";
        return (
          <label key={`table-slot-${index}`} className="block text-sm">
            <span className="opacity-70">{translate(labelKey)}</span>
            <ReservationTableSelect
              tables={tables}
              value={tableId}
              onChange={(nextId) => setAt(index, nextId)}
              className={`${className} mt-1`}
              excludeIds={excludeIds}
            />
          </label>
        );
      })}

      <div className="flex flex-wrap items-center gap-2">
        {canAdd ? (
          <button
            type="button"
            onClick={() => setSlotCount((count) => Math.min(MAX_RESERVATION_TABLES, count + 1))}
            className="rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            + {translate("addAnotherTable")}
          </button>
        ) : null}
        {canRemoveLast ? (
          <button
            type="button"
            onClick={() => setSlotCount((count) => Math.max(1, count - 1))}
            className="rounded-lg px-2 py-1.5 text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
          >
            {translate("removeTableSlot")}
          </button>
        ) : null}
      </div>

      <p className="text-xs opacity-60">
        {translate("selectSecondTableHint").replace("{max}", String(MAX_RESERVATION_TABLES))}
      </p>
    </div>
  );
}

export function isOccupiedTable(tables: RestaurantTable[], tableId: string): boolean {
  const table = tables.find((row) => row.id === tableId);
  return table != null && table.status !== "empty";
}

export function isAnyOccupiedTable(tables: RestaurantTable[], tableIds: string[]): boolean {
  return normalizeReservationTableIds(tableIds).some((id) => isOccupiedTable(tables, id));
}
