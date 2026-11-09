"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { LockKeyhole, RefreshCw, UnlockKeyhole } from "lucide-react";
import { Modal } from "@/components/modal";
import { TableAvailabilitySummary } from "@/components/table-availability-summary";
import { ReservationUnavailableSlots } from "@/components/reservation-unavailable-slots";
import { todayIsoDateInVenue } from "@/lib/venue-timezone";
import { useSettings } from "@/contexts/settings-context";
import { useConnectionStatus } from "@/contexts/connection-status-context";
import { calculateTableAvailability, type TableAvailabilitySource } from "@/lib/table-availability";
import type { LanguageCode, ReservationRecord, RestaurantTable } from "@/lib/types";

const COPY = {
  en: { title: "Capacity", tables: "Block tables", lock: "Block", unlock: "Unblock", blocked: "Blocked", unblocked: "Not blocked", loading: "Loading tables…", error: "Could not load tables.", refresh: "Refresh" },
  cs: { title: "Kapacita", tables: "Blokování stolů", lock: "Blokovat", unlock: "Odblokovat", blocked: "Blokováno", unblocked: "Neblokováno", loading: "Načítám stoly…", error: "Stoly se nepodařilo načíst.", refresh: "Obnovit" },
  vi: { title: "Sức chứa", tables: "Khóa / mở khóa bàn", lock: "Khóa bàn", unlock: "Mở khóa", blocked: "Đã khóa", unblocked: "Không khóa", loading: "Đang tải bàn…", error: "Không tải được danh sách bàn.", refresh: "Làm mới" },
  zh: { title: "容量", tables: "锁定餐桌", lock: "锁定", unlock: "解锁", blocked: "已锁定", unblocked: "未锁定", loading: "正在加载餐桌…", error: "无法加载餐桌。", refresh: "刷新" },
} as const;

export function TableAvailabilityDashboard({ tables, reservations, language, staff = false, enabled = true, realtimeConnected, refreshKey = 0,
  compact = false, detailsOpen = false, onCloseDetails, detailsHeader, capacityDateIso = todayIsoDateInVenue(),
}: {
  tables: RestaurantTable[]; reservations: ReservationRecord[]; language: LanguageCode;
  staff?: boolean; enabled?: boolean; realtimeConnected: boolean;
  refreshKey?: number; compact?: boolean; detailsOpen?: boolean; onCloseDetails?: () => void;
  detailsHeader?: ReactNode; capacityDateIso?: string;
}) {
  const copy = COPY[language];
  const { settings } = useSettings();
  const { status: connectionStatus } = useConnectionStatus();
  const [source, setSource] = useState<TableAvailabilitySource | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const tableVersion = useMemo(() => JSON.stringify(tables.map((table) => [table.id, table.label,
    table.status === "empty", table.occupiedAt?.getTime(), table.availabilityBlocked])), [tables]);
  const reservationVersion = useMemo(() => JSON.stringify(reservations.map((row) => [row.id, row.status,
    row.reservedAt.getTime(), row.checkedInAt?.getTime(), row.partySize, row.actualPartySize, row.wantsGrill,
    row.tableId, row.secondaryTableId, row.tertiaryTableId, row.notes])), [reservations]);

  // Parent screens already subscribe to reservations, floor tables and settings.
  // Coalesce their updates; this widget creates no duplicate subscriptions.
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch("/api/reservations/live-availability", { cache: "no-store", signal: controller.signal });
          if (!response.ok) throw new Error("Availability unavailable");
          const result = await response.json();
          if (controller.signal.aborted) return;
          const received = Date.now();
          setReceivedAt(received);
          setClock(received);
          setSource(result.source);
          setError(false);
        } catch {
          if (!controller.signal.aborted) setError(true);
        }
      })();
    }, 450);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [enabled, tableVersion, reservationVersion, settings.reservationDurationMinutes, settings.reservationBufferMinutes,
    realtimeConnected, connectionStatus, revision, refreshKey]);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => { if (!document.hidden) setClock(Date.now()); };
    const wake = () => { if (!document.hidden) { tick(); refresh(); } };
    const timer = window.setInterval(tick, 30_000); // local display only; never fetches
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", wake); window.removeEventListener("online", refresh); };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || !source) return;
    // Invalidate only when the loaded future-reservation horizon expires.
    const timer = window.setTimeout(refresh, Math.max(0, 48 * 60 * 60_000 - (Date.now() - receivedAt)));
    return () => window.clearTimeout(timer);
  }, [enabled, source, receivedAt, refresh]);

  const now = source ? new Date(source.serverNow).getTime() + Math.max(0, clock - receivedAt) : clock;
  const view = useMemo(() => source ? calculateTableAvailability(source, now) : null, [source, now]);
  const live = enabled && Boolean(source) && realtimeConnected && connectionStatus === "online" && !error;
  const capacityRevision = JSON.stringify([tableVersion, reservationVersion, revision, refreshKey,
    realtimeConnected, connectionStatus]);

  const block = async (tableId: string, blocked: boolean) => {
    setBusyId(tableId); setActionError(null);
    try {
      const response = await fetch("/api/reservations/live-availability", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "block", tableId, blocked }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      refresh();
    } catch (err) { setActionError(err instanceof Error ? err.message : copy.error); }
    finally { setBusyId(null); }
  };

  if (!enabled) return null;
  const renderTableLocks = () => (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole className="h-4 w-4 text-[#C9A88B]" aria-hidden />{copy.tables}</h3>
        <button type="button" onClick={refresh} aria-label={copy.refresh}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition-colors hover:bg-[var(--accent)]">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {actionError && <p role="alert" className="mt-3 text-xs text-red-600 dark:text-red-300">{actionError}</p>}
      {error || !view ? <p role="status" className="mt-3 text-sm text-[var(--muted)]">{error ? copy.error : copy.loading}</p>
        : <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {[...view.tables].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })).map(table => (
            <button key={table.id} type="button" aria-pressed={table.blocked}
              aria-label={`${table.blocked ? copy.unlock : copy.lock} ${table.label}`}
              disabled={!staff || busyId !== null}
              onClick={() => void block(table.id, !table.blocked)}
              className={`flex min-h-14 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A88B] disabled:cursor-wait disabled:opacity-50 ${table.blocked
                ? "border-amber-400/40 bg-amber-400/10 text-amber-800 dark:text-amber-100"
                : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--accent)]"}`}>
              {busyId === table.id ? <RefreshCw className="h-4 w-4 shrink-0 motion-safe:animate-spin" aria-hidden />
                : table.blocked ? <LockKeyhole className="h-4 w-4 shrink-0" aria-hidden /> : <UnlockKeyhole className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden />}
              <span><strong className="block text-sm font-semibold">{table.label}</strong>
                <span className="block text-[10px] opacity-70">{table.blocked ? copy.blocked : copy.unblocked}</span></span>
            </button>
          ))}
        </div>}
    </section>
  );

  if (!compact) return renderTableLocks();
  return <>
    <TableAvailabilitySummary source={source} tables={view?.tables ?? []} now={now}
      language={language} live={live} error={error} />
    {detailsOpen && onCloseDetails && <Modal open onClose={onCloseDetails} title={copy.title} size="xl"
      bodyClassName="px-4 py-4 sm:px-6">
      <div className="space-y-4">
        {detailsHeader}
        <ReservationUnavailableSlots dateIso={capacityDateIso} refreshKey={capacityRevision} language={language} now={now} />
        {renderTableLocks()}
      </div>
    </Modal>}
  </>;
}
