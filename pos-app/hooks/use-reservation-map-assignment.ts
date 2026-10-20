"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useMotionValue } from "framer-motion";
import { blockedTableLabels, resolveGrill, timeFromReservedAt } from "@/lib/reservation-capacity-engine";
import { RESERVATION_FLOOR_TABLES, floorTableByLabel } from "@/lib/reservation-floor-plan";
import { todayIsoDateInVenue } from "@/lib/venue-timezone";
import { assignReservationTables, mapReservationsResponse } from "@/src/lib/reservation-actions";
import type { ReservationRecord, RestaurantTable } from "@/lib/types";

const ACTIVE = ["pending", "confirmed", "late"];
type PointerDrag = { reservationId: string; pointerId: number; startX: number; startY: number; active: boolean; wasSelected: boolean };

export function useReservationMapAssignment({ tables, reservations, disabled, durationMinutes, bufferMinutes, now,
  onAssigned, unavailableMessage }: {
  tables: RestaurantTable[]; reservations: ReservationRecord[]; disabled: boolean;
  durationMinutes: number; bufferMinutes: number; now: number;
  onAssigned: (reservation: ReservationRecord) => void; unavailableMessage: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pointer = useRef<PointerDrag | null>(null);
  const locked = useRef(false);
  const dragX = useMotionValue(0), dragY = useMotionValue(0);
  const selected = reservations.find((row) => row.id === selectedId && ACTIVE.includes(row.status)) ?? null;
  const dragging = reservations.find((row) => row.id === draggingId) ?? null;

  const eligibleFor = useCallback((row: ReservationRecord) => {
    const occupiedTables = RESERVATION_FLOOR_TABLES.map((def) => {
      const table = tables.find((t) => t.label.trim().toUpperCase() === def.label);
      return { label: def.label, occupied: table ? table.status !== "empty" : false,
        occupiedAt: table?.occupiedAt, blocked: !table || table.availabilityBlocked === true };
    });
    const blocked = blockedTableLabels({ reservations, occupiedTables, dateIso: todayIsoDateInVenue(row.reservedAt),
      time: timeFromReservedAt(row.reservedAt), durationMinutes, bufferMinutes, excludeReservationId: row.id, nowMs: now });
    const grill = resolveGrill(row);
    return new Set(tables.filter((table) => {
      const def = floorTableByLabel(table.label);
      return def && def.capacity >= row.partySize && (grill !== "yes" || def.grill) && !blocked.has(def.label);
    }).map((table) => table.id));
  }, [tables, reservations, durationMinutes, bufferMinutes, now]);
  const eligibleIds = useMemo(() => selected ? eligibleFor(selected) : new Set<string>(), [selected, eligibleFor]);

  const clearDrag = useCallback(() => { pointer.current = null; setDraggingId(null); setTargetId(null); }, []);
  const cancel = useCallback(() => { clearDrag(); setSelectedId(null); setError(null); }, [clearDrag]);
  useEffect(() => {
    if (disabled || (selectedId && !selected)) cancel();
  }, [disabled, selectedId, selected, cancel]);

  const assign = useCallback(async (reservationId: string, tableId: string) => {
    if (disabled || locked.current) return;
    const row = reservations.find((r) => r.id === reservationId && ACTIVE.includes(r.status));
    if (!row || !eligibleFor(row).has(tableId)) { setError(unavailableMessage); return; }
    if (row.tableId === tableId && !row.secondaryTableId && !row.tertiaryTableId) { cancel(); return; }
    locked.current = true; setBusyId(reservationId); setError(null);
    try {
      const result = await assignReservationTables(reservationId, [tableId]);
      if (result.error) throw result.error;
      if (!result.data) throw new Error(unavailableMessage);
      const updated = mapReservationsResponse([result.data])[0];
      if (updated) onAssigned(updated);
      setSelectedId(null);
    } catch (err) {
      setError((err as { code?: string })?.code === "PGRST116" ? unavailableMessage
        : (err as { message?: string })?.message ?? unavailableMessage);
    } finally { locked.current = false; setBusyId(null); }
  }, [disabled, reservations, eligibleFor, unavailableMessage, onAssigned, cancel]);

  const select = useCallback((id: string) => {
    if (disabled || locked.current) return;
    setError(null); setSelectedId((current) => current === id ? null : id);
  }, [disabled]);
  const start = useCallback((id: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled || locked.current || !event.isPrimary || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = { reservationId: id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      active: false, wasSelected: selectedId === id };
    setSelectedId(id); setError(null);
    dragX.set(event.clientX + 14); dragY.set(event.clientY + 14);
  }, [disabled, selectedId, dragX, dragY]);

  useEffect(() => {
    const hit = (event: PointerEvent) => document.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-reservation-drop-table]")?.dataset.reservationDropTable ?? null;
    const move = (event: PointerEvent) => {
      const current = pointer.current;
      if (!current || event.pointerId !== current.pointerId) return;
      if (!current.active && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 6) return;
      if (!current.active) { current.active = true; setDraggingId(current.reservationId); }
      dragX.set(event.clientX + 14); dragY.set(event.clientY + 14);
      const target = hit(event);
      setTargetId((previous) => previous === target ? previous : target);
    };
    const up = (event: PointerEvent) => {
      const current = pointer.current;
      if (!current || event.pointerId !== current.pointerId) return;
      const target = current.active ? hit(event) : null;
      clearDrag();
      if (target) void assign(current.reservationId, target);
      else if (!current.active) setSelectedId(current.wasSelected ? null : current.reservationId);
    };
    const stop = (event: PointerEvent) => { if (pointer.current?.pointerId === event.pointerId) clearDrag(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", stop); window.removeEventListener("keydown", escape);
    };
  }, [assign, clearDrag, cancel, dragX, dragY]);

  const activateTable = (table: RestaurantTable) => {
    if (!selected || disabled) return false;
    void assign(selected.id, table.id);
    return true;
  };
  return { selected, selectedId, dragging, targetId, busyId, error, eligibleIds, dragX, dragY,
    select, start, cancel, activateTable };
}
