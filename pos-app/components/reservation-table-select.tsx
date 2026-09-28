"use client";

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
  /** Exclude these table ids from the options (e.g. the other dual-table pick). */
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

/** Pick up to 2 tables for large-party assign / check-in. */
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
  const primary = ids[0] ?? "";
  const secondary = ids[1] ?? "";

  const setPrimary = (tableId: string) => {
    onChange(normalizeReservationTableIds([tableId, secondary === tableId ? "" : secondary]));
  };

  const setSecondary = (tableId: string) => {
    onChange(normalizeReservationTableIds([primary, tableId]));
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm">
        <span className="opacity-70">{translate("selectTable")}</span>
        <ReservationTableSelect
          tables={tables}
          value={primary}
          onChange={setPrimary}
          className={`${className} mt-1`}
          excludeIds={secondary ? [secondary] : []}
        />
      </label>
      <label className="block text-sm">
        <span className="opacity-70">{translate("selectSecondTable")}</span>
        <ReservationTableSelect
          tables={tables}
          value={secondary}
          onChange={setSecondary}
          className={`${className} mt-1`}
          excludeIds={primary ? [primary] : []}
        />
      </label>
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
