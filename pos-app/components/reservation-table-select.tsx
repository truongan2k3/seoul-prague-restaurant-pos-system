"use client";

import { useApp } from "@/contexts/app-context";
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
}

export function ReservationTableSelect({
  tables,
  value,
  onChange,
  className = "pos-input",
  includeAnyTable = true,
}: ReservationTableSelectProps) {
  const { translate } = useApp();
  const { empty, occupied } = tableGroups(tables);

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

export function isOccupiedTable(tables: RestaurantTable[], tableId: string): boolean {
  const table = tables.find((row) => row.id === tableId);
  return table != null && table.status !== "empty";
}
