"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HeaderClockWithStatus } from "@/components/connection-status-badge";
import { MapReservationTicker } from "@/components/map-reservation-ticker";
import { NotificationBell } from "@/components/notification-bell";
import { TableCard } from "@/components/table-card";
import { TableEditModal } from "@/components/table-edit-modal";
import { useApp } from "@/contexts/app-context";
import {
  formatFloorTableAssignmentLabel,
  reservationOnVenueDateIso,
} from "@/lib/reservation-floor-display";
import { todayIsoDateInVenue, venueDayRangeUtc } from "@/lib/venue-timezone";
import { TABLE_CARD_WIDTH, resolveFloorCardOverlaps } from "@/lib/table-layout";
import { tableIdsWithSlaBreach } from "@/lib/order-sla";
import type { MenuItem, OrderItem, ReservationRecord, ReservationStatus, RestaurantTable } from "@/lib/types";
import {
  fetchReservations,
  mapReservationsResponse,
  subscribeToReservationChanges,
} from "@/src/lib/reservation-actions";
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

type PlannedFloorReservation = {
  displayLabel: string;
  reservedAtMs: number;
};

/** Upcoming assigned bookings still waiting to be seated. */
const PLANNED_FLOOR_STATUSES: ReservationStatus[] = ["pending", "confirmed", "late"];

function buildPlannedByTableId(
  reservations: ReservationRecord[],
  language: string,
  venueDateIso: string,
): Record<string, PlannedFloorReservation> {
  const byTable: Record<string, PlannedFloorReservation> = {};

  const candidates = reservations
    .filter(
      (row) =>
        reservationOnVenueDateIso(row.reservedAt, venueDateIso) &&
        PLANNED_FLOOR_STATUSES.includes(row.status) &&
        Boolean(row.tableId || row.secondaryTableId),
    )
    .sort((a, b) => a.reservedAt.getTime() - b.reservedAt.getTime());

  for (const row of candidates) {
    const planned: PlannedFloorReservation = {
      displayLabel: formatFloorTableAssignmentLabel({
        reservedAt: row.reservedAt,
        guestName: row.guestName,
        partySize: row.partySize,
        language,
      }),
      reservedAtMs: row.reservedAt.getTime(),
    };
    for (const tableId of [row.tableId, row.secondaryTableId]) {
      if (!tableId) continue;
      const existing = byTable[tableId];
      // Prefer the soonest upcoming assignment if multiple touch the same table.
      if (!existing || planned.reservedAtMs < existing.reservedAtMs) {
        byTable[tableId] = planned;
      }
    }
  }

  return byTable;
}

export function MapView({
  tables,
  setTables,
  menuItems,
  orderItems,
  onRefresh,
  onTableClick,
  actionError,
}: MapViewProps) {
  const { translate, language } = useApp();
  const mapRef = useRef<HTMLDivElement>(null);
  const [editMode, setEditMode] = useState(false);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [slaClock, setSlaClock] = useState(() => Date.now());
  const [plannedReservations, setPlannedReservations] = useState<ReservationRecord[]>([]);

  const venueTodayIso = todayIsoDateInVenue();

  const loadPlannedReservations = useCallback(async () => {
    const dateIso = todayIsoDateInVenue();
    const { startIso } = venueDayRangeUtc(dateIso);
    const { data, error } = await fetchReservations(new Date(startIso));
    if (error || !data) return;
    setPlannedReservations(mapReservationsResponse(data));
  }, []);

  useEffect(() => {
    void loadPlannedReservations();
    return subscribeToReservationChanges(() => {
      void loadPlannedReservations();
    });
  }, [loadPlannedReservations]);

  const plannedByTableId = useMemo(
    () => buildPlannedByTableId(plannedReservations, language, venueTodayIso),
    [plannedReservations, language, venueTodayIso],
  );

  useEffect(() => {
    const interval = setInterval(() => setSlaClock(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const slaAlertTableIds = useMemo(
    () => tableIdsWithSlaBreach(orderItems, slaClock),
    [orderItems, slaClock],
  );

  useEffect(() => {
    const raw = tables.map((table) => ({
      id: table.id,
      x: table.posX,
      y: table.posY,
    }));
    setPositions(resolveFloorCardOverlaps(raw));
  }, [tables]);

  const displayPositions = useMemo(() => {
    if (editMode || dragState) return positions;
    return resolveFloorCardOverlaps(
      Object.entries(positions).map(([id, pos]) => ({ id, x: pos.x, y: pos.y })),
    );
  }, [positions, editMode, dragState]);

  const mapHeight = useMemo(() => {
    const source = editMode || dragState ? positions : displayPositions;
    const bottom = tables.reduce((max, table) => {
      const pos = source[table.id] ?? { x: table.posX, y: table.posY };
      return Math.max(max, pos.y + 200);
    }, 520);
    return bottom;
  }, [tables, positions, displayPositions, editMode, dragState]);

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
    }
    setDragState(null);
  }, [dragState, positions, setTables]);

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

  const plannedFor = (tableId: string) => {
    const row = plannedByTableId[tableId];
    if (!row) return null;
    return { displayLabel: row.displayLabel };
  };

  return (
    <div className="flex h-full flex-col bg-background text-[var(--foreground)]">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--pos-raised)] px-2.5 py-1.5 sm:gap-3 sm:px-4 sm:py-2.5 lg:px-6 lg:py-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2.5">
          <h1 className="pos-header-title shrink-0">
            {translate("map")}
          </h1>
          <div className="hidden items-center gap-3 text-xs text-[var(--muted)] md:flex">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border border-[var(--border)] bg-[var(--card)]" />
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
            className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-sm ${
              editMode
                ? "border-[var(--pos-champagne)]/50 bg-[var(--pos-champagne)]/15 text-[var(--pos-champagne)]"
                : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]"
            }`}
          >
            {editMode ? translate("saveLayout") : translate("editMode")}
          </button>
          {editMode && (
            <span className="hidden text-xs text-[var(--muted)] sm:inline">
              {translate("editLayoutHint")}
            </span>
          )}
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-1 sm:gap-2">
          <NotificationBell />
          <HeaderClockWithStatus />
        </div>
      </header>

      {actionError && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {actionError}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-3 md:p-4">
        {/* Responsive grid — mobile, tablet, smaller desktops */}
        <div className="xl:hidden">
          {editMode && (
            <p className="mb-3 rounded-lg border border-[var(--pos-champagne)]/30 bg-[var(--pos-champagne)]/10 px-3 py-2 text-xs text-[var(--pos-champagne)]">
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
                    plannedReservation={plannedFor(table.id)}
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
          className="relative mx-auto hidden h-full min-h-[520px] w-full bg-background xl:block"
          style={{ height: mapHeight, width: "100%" }}
        >
          {tables.map((table) => {
            const pos =
              (editMode || dragState ? positions[table.id] : displayPositions[table.id]) ??
              positions[table.id] ?? { x: table.posX, y: table.posY };
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
                    plannedReservation={plannedFor(table.id)}
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
                    plannedReservation={plannedFor(table.id)}
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
