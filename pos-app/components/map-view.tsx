"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LiveClock } from "@/components/live-clock";
import { MapReservationTicker } from "@/components/map-reservation-ticker";
import { NotificationBell } from "@/components/notification-bell";
import { TableCard } from "@/components/table-card";
import { TableEditModal } from "@/components/table-edit-modal";
import { useApp } from "@/contexts/app-context";
import { TABLE_CARD_WIDTH } from "@/lib/table-layout";
import { tableIdsWithSlaBreach } from "@/lib/order-sla";
import type { MenuItem, OrderItem, RestaurantTable } from "@/lib/types";
import { updateTablePosition } from "@/src/lib/supabase-data";

interface MapViewProps {
  tables: RestaurantTable[];
  setTables: React.Dispatch<React.SetStateAction<RestaurantTable[]>>;
  menuItems: MenuItem[];
  orderItems: OrderItem[];
  onRefresh: () => void;
  onTableClick: (table: RestaurantTable) => void;
  actionError?: string | null;
}

type DragState = {
  tableId: string;
  offsetX: number;
  offsetY: number;
};

export function MapView({
  tables,
  setTables,
  menuItems,
  orderItems,
  onRefresh,
  onTableClick,
  actionError,
}: MapViewProps) {
  const { translate } = useApp();
  const mapRef = useRef<HTMLDivElement>(null);
  const [editMode, setEditMode] = useState(false);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [slaClock, setSlaClock] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setSlaClock(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const slaAlertTableIds = useMemo(
    () => tableIdsWithSlaBreach(orderItems, slaClock),
    [orderItems, slaClock],
  );

  useEffect(() => {
    setPositions(
      Object.fromEntries(tables.map((table) => [table.id, { x: table.posX, y: table.posY }])),
    );
  }, [tables]);

  const mapHeight = useMemo(() => {
    const bottom = tables.reduce((max, table) => {
      const pos = positions[table.id] ?? { x: table.posX, y: table.posY };
      return Math.max(max, pos.y + 200);
    }, 520);
    return bottom;
  }, [tables, positions]);

  const finishDrag = useCallback(async () => {
    if (!dragState) return;
    const pos = positions[dragState.tableId];
    if (pos) {
      await updateTablePosition(dragState.tableId, pos.x, pos.y);
      setTables((prev) =>
        prev.map((table) =>
          table.id === dragState.tableId ? { ...table, posX: pos.x, posY: pos.y } : table,
        ),
      );
      onRefresh();
    }
    setDragState(null);
  }, [dragState, positions, setTables, onRefresh]);

  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (event: PointerEvent) => {
      const mapEl = mapRef.current;
      if (!mapEl) return;
      const rect = mapEl.getBoundingClientRect();
      const x = Math.max(0, event.clientX - rect.left - dragState.offsetX);
      const y = Math.max(0, event.clientY - rect.top - dragState.offsetY);
      setPositions((prev) => ({
        ...prev,
        [dragState.tableId]: { x, y },
      }));
    };

    const handlePointerUp = () => {
      void finishDrag();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState, finishDrag]);

  const handlePointerDown = (tableId: string, event: React.PointerEvent<HTMLElement>) => {
    if (!editMode || !mapRef.current) return;
    event.preventDefault();
    const pos = positions[tableId] ?? { x: 0, y: 0 };
    setDragState({
      tableId,
      offsetX: event.clientX - mapRef.current.getBoundingClientRect().left - pos.x,
      offsetY: event.clientY - mapRef.current.getBoundingClientRect().top - pos.y,
    });
  };

  return (
    <div className="flex h-full flex-col bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 sm:px-6 sm:py-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {translate("map")}
          </h1>
          <div className="hidden items-center gap-3 text-xs text-gray-500 sm:flex dark:text-gray-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border border-gray-400 bg-gray-100 dark:border-gray-600 dark:bg-gray-800" />
              {translate("available")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]" />
              {translate("preparing")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
              {translate("ready")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setEditMode((value) => !value)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
              editMode
                ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300"
                : "border-gray-200 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            }`}
          >
            {editMode ? translate("saveLayout") : translate("editMode")}
          </button>
          {editMode && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {translate("editLayoutHint")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <LiveClock />
        </div>
      </header>

      {actionError && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {actionError}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4 md:p-6">
        {/* Responsive grid — mobile, tablet, smaller desktops */}
        <div className="xl:hidden">
          {editMode && (
            <p className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
              {translate("editLayoutHint")} (drag layout: desktop XL+)
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-6">
            {[...tables]
              .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
              .map((table) => {
                const tableOrderItems = orderItems.filter((item) => item.tableId === table.id);
                return (
                  <TableCard
                    key={table.id}
                    table={table}
                    menuItems={menuItems}
                    orderItems={tableOrderItems}
                    slaAlert={slaAlertTableIds.has(table.id)}
                    compact
                    editMode={editMode}
                    onEdit={() => setEditingTable(table)}
                    onClick={() => !editMode && onTableClick(table)}
                  />
                );
              })}
          </div>
        </div>

        {/* Free-position floor plan — large desktop */}
        <div
          ref={mapRef}
          className="relative mx-auto hidden rounded-2xl border border-dashed border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/40 xl:block"
          style={{ height: mapHeight, width: "100%", maxWidth: 1200 }}
        >
          {tables.map((table) => {
            const pos = positions[table.id] ?? { x: table.posX, y: table.posY };
            const isDragging = dragState?.tableId === table.id;
            const tableOrderItems = orderItems.filter((item) => item.tableId === table.id);

            return (
              <div
                key={table.id}
                className={`absolute ${isDragging ? "z-20" : "z-10"}`}
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: TABLE_CARD_WIDTH,
                }}
              >
                {editMode ? (
                  <TableCard
                    table={table}
                    menuItems={menuItems}
                    orderItems={tableOrderItems}
                    slaAlert={slaAlertTableIds.has(table.id)}
                    editMode
                    onEdit={() => setEditingTable(table)}
                    onPointerDown={(event) => handlePointerDown(table.id, event)}
                  />
                ) : (
                  <TableCard
                    table={table}
                    menuItems={menuItems}
                    orderItems={tableOrderItems}
                    slaAlert={slaAlertTableIds.has(table.id)}
                    onClick={() => onTableClick(table)}
                  />
                )}
              </div>
            );
          })}
        </div>
        </div>

        <MapReservationTicker />
      </div>

      <TableEditModal
        open={editingTable != null}
        table={editingTable}
        onClose={() => setEditingTable(null)}
        onSaved={onRefresh}
      />
    </div>
  );
}
