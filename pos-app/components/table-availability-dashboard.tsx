"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Clock3, LockKeyhole, RefreshCw, UnlockKeyhole, Wifi, WifiOff } from "lucide-react";
import { useSettings } from "@/contexts/settings-context";
import { useConnectionStatus } from "@/contexts/connection-status-context";
import { calculateTableAvailability, type TableAvailabilitySource } from "@/lib/table-availability";
import type { LanguageCode, ReservationRecord, RestaurantTable } from "@/lib/types";

const COPY = {
  en: { title: "Live table availability", available: "Available tables", large: "Large tables", small: "Small tables",
    occupied: "Occupied", reserved: "Reserved", unavailable: "Reserved / unavailable", blocked: "Blocked", next: "Next table expected", ask: "Ask staff",
    ready: "Ready now", over: "Over estimated time", remaining: "remaining", live: "Live", offline: "Reconnecting",
    updated: "Updated", details: "Table overview", estimate: "Estimated · subject to actual departure", lock: "Block", unlock: "Unblock" },
  cs: { title: "Aktuální dostupnost stolů", available: "Volné stoly", large: "Velké stoly", small: "Malé stoly",
    occupied: "Obsazeno", reserved: "Rezervováno", unavailable: "Rezervované / nedostupné", blocked: "Blokováno", next: "Další stůl přibližně za", ask: "Zeptejte se obsluhy",
    ready: "Volný nyní", over: "Překročena odhadovaná doba", remaining: "zbývá", live: "Živě", offline: "Obnovování spojení",
    updated: "Aktualizace", details: "Přehled stolů", estimate: "Odhad · závisí na skutečném odchodu hostů", lock: "Blokovat", unlock: "Odblokovat" },
  vi: { title: "Tình trạng bàn trực tiếp", available: "Bàn trống", large: "Bàn lớn", small: "Bàn nhỏ",
    occupied: "Có khách", reserved: "Đã đặt", unavailable: "Đã đặt / chưa sẵn sàng", blocked: "Tạm khóa", next: "Dự kiến có bàn tiếp theo", ask: "Hỏi nhân viên",
    ready: "Sẵn sàng đón khách", over: "Đã quá thời gian dự kiến", remaining: "còn lại", live: "Trực tiếp", offline: "Đang kết nối lại",
    updated: "Cập nhật", details: "Chi tiết từng bàn", estimate: "Ước tính · tùy thời điểm khách rời bàn", lock: "Khóa bàn", unlock: "Mở khóa" },
} as const;

const TONE = { available: "text-emerald-300", occupied: "text-rose-300", reserved: "text-amber-200", blocked: "text-zinc-400" };
const DETAIL_COPY = {
  en: { guests: "guests", suggest: "Available now", bookings: "Upcoming bookings", seating: "Next seating", noReady: "No tables ready now", seats: "seats" },
  cs: { guests: "hostů", suggest: "Volné nyní", bookings: "Následující rezervace", seating: "Další usazení", noReady: "Žádný stůl nyní není volný", seats: "míst" },
  vi: { guests: "khách", suggest: "Bàn đang trống", bookings: "Lượt đặt bàn tiếp theo", seating: "Lượt đón khách tiếp theo", noReady: "Chưa có bàn trống", seats: "chỗ" },
} as const;

export function TableAvailabilityDashboard({ tables, reservations, language, staff = false, enabled = true, realtimeConnected, refreshKey = 0 }: {
  tables: RestaurantTable[]; reservations: ReservationRecord[]; language: LanguageCode;
  staff?: boolean; enabled?: boolean; realtimeConnected: boolean;
  refreshKey?: number;
}) {
  const copy = COPY[language === "zh" ? "vi" : language];
  const detail = DETAIL_COPY[language === "zh" ? "vi" : language];
  const { settings } = useSettings();
  const { status: connectionStatus } = useConnectionStatus();
  const reduced = useReducedMotion();
  const [source, setSource] = useState<TableAvailabilitySource | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
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
  const availableTables = useMemo(() => (view?.tables ?? []).filter((table) => table.status === "available")
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })), [view]);
  const live = enabled && Boolean(source) && realtimeConnected && connectionStatus === "online" && !error;
  const duration = (at: number) => {
    const minutes = Math.max(1, Math.ceil((at - now) / 60_000));
    return minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes} min`;
  };
  const time = (at: number | string) => new Intl.DateTimeFormat(language === "cs" ? "cs-CZ" : "en-GB", {
    timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(at));
  const bookingTime = (at: number) => {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" });
    if (day.format(new Date(at)) === day.format(new Date(now))) return time(at);
    return new Intl.DateTimeFormat(language === "cs" ? "cs-CZ" : "en-GB", { timeZone: "Europe/Prague",
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(at));
  };

  const block = async (tableId: string, blocked: boolean) => {
    setBusyId(tableId); setActionError(null);
    try {
      const response = await fetch("/api/reservations/live-availability", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "block", tableId, blocked }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      refresh();
    } catch (err) { setActionError(err instanceof Error ? err.message : copy.ask); }
    finally { setBusyId(null); }
  };

  if (!enabled) return null;
  return (
    <section className="mb-3 overflow-hidden rounded-2xl border border-[#C9A88B]/25 bg-gradient-to-br from-[#262321]/95 via-[#171719]/95 to-[#111214]/95 px-3.5 py-3 text-[#F3EDE5] shadow-[0_8px_28px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md sm:px-5 sm:py-4" aria-label={copy.title}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#D7BDA5] sm:text-xs">{copy.title}</h2>
        <span className={`inline-flex items-center gap-1.5 text-[10px] ${live ? "text-emerald-300/90" : "text-amber-200/80"}`} role="status">
          {live && <motion.span className="h-1 w-1 rounded-full bg-emerald-300" animate={{ opacity: reduced ? 1 : [.55, 1, .55] }} transition={{ duration: 2.8, repeat: reduced ? 0 : Infinity }} />}
          {live ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {live ? copy.live : copy.offline}
          <button type="button" onClick={refresh} aria-label={copy.updated} className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10"><RefreshCw className="h-3 w-3" /></button>
        </span>
      </div>
      <div className="grid grid-cols-3 divide-x divide-[#C9A88B]/15 rounded-xl border border-white/[0.07] bg-white/[0.025] py-2.5">
        {([ ["available", copy.available], ["large", copy.large], ["small", copy.small] ] as const).map(([key, label]) => (
          <div key={key} className="flex min-w-0 flex-col items-center px-1 text-center">
            <div className={`relative h-10 overflow-hidden font-serif text-3xl leading-10 tabular-nums sm:text-4xl ${key === "available" ? "text-emerald-200" : "text-[#E8D5C4]"}`} aria-live="polite" aria-atomic="true">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={error || !view ? "unknown" : view[key]} className="inline-block"
                  initial={{ y: reduced ? 0 : 8, opacity: reduced ? 1 : 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: reduced ? 0 : -8, opacity: 0 }} transition={{ duration: reduced ? 0 : .25 }}>
                  {error || !view ? "—" : view[key]}
                </motion.span>
              </AnimatePresence>
            </div>
            <span className="mt-1 text-[9px] font-medium uppercase leading-tight tracking-[0.06em] text-white/60 sm:text-[10px]">{label}</span>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-white/55">
        <p>{copy.occupied}: <b className="font-medium text-rose-200">{error ? "—" : view?.occupied ?? "—"}</b><span className="mx-2 text-white/20">·</span>{copy.unavailable}: <b className="font-medium text-amber-100">{error ? "—" : (view ? view.reserved + view.blocked : "—")}</b></p>
        <span>{copy.updated} {source ? time(source.serverNow) : "—"}</span>
      </div>
      <div className="mt-2.5 flex items-start gap-2 border-t border-white/[0.07] pt-2.5">
        <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#C9A88B]" />
        <div className="min-w-0 flex-1"><p className="text-xs text-white/70">{copy.next}<span className="ml-2 font-semibold text-[#E8D5C4]">{live && view?.nextAvailableAt ? `~${duration(view.nextAvailableAt)}` : copy.ask}</span></p>
          <p className="mt-0.5 text-[10px] text-white/40">{copy.estimate}</p></div>
        <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[#C9A88B]/25 px-2.5 text-[11px] text-[#D7BDA5] hover:bg-white/5">
          {copy.details}<ChevronDown className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} /></button>
      </div>
      <div className="mt-3 rounded-xl border border-[#C9A88B]/15 bg-black/15 p-3">
        <h3 className="text-[11px] font-semibold text-[#E8D5C4]">{detail.suggest}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          {live && availableTables.length ? availableTables.map((table) => <span key={table.id} className="rounded-md border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 text-emerald-100"><strong>{table.label}</strong> · {table.capacity} {detail.seats}</span>) : <span className="text-white/60">{live ? detail.noReady : copy.ask}</span>}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {expanded && view && !error && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduced ? 0 : .25 }} className="overflow-hidden">
          {actionError && <p role="alert" className="mt-3 text-xs text-rose-200">{actionError}</p>}
          <div className="mt-3 grid gap-1.5 border-t border-white/10 pt-3 sm:grid-cols-2">
            {[...view.tables].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })).map((table) => <div key={table.id} className={`flex items-start gap-2 rounded-xl border px-3 py-3 ${live && table.status === "available" ? "border-emerald-300/30 bg-emerald-300/[0.06]" : "border-white/[0.04] bg-white/[0.035]"}`}>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full bg-current ${TONE[table.status]}`} />
              <strong className="min-w-7 text-xl leading-6 text-white">{table.label}</strong>
              <div className="min-w-0 flex-1 text-[11px]"><p className={TONE[table.status]}>{copy[table.status === "available" ? "ready" : table.status]}<span className="ml-2 text-[10px] text-white/40">{table.capacity} {detail.seats}{table.grill ? " · BBQ" : ""}</span></p>
                <p className="text-white/45">{table.status === "occupied" ? table.overEstimatedTime ? copy.over : table.estimatedReleaseAt ? `~${duration(table.estimatedReleaseAt)} ${copy.remaining}` : copy.ask
                  : table.status === "reserved" ? table.nextReservationAt ? time(table.nextReservationAt) : table.earliestSeatingAt ? `~${duration(table.earliestSeatingAt)}` : copy.ask
                  : table.status === "blocked" ? copy.ask : ""}</p>
                {table.status !== "available" && table.earliestSeatingAt !== null && table.earliestSeatingAt > now && <p className="mt-1 text-[#D7BDA5]">{detail.seating}: ~{duration(table.earliestSeatingAt)} · {bookingTime(table.earliestSeatingAt)}</p>}
                {table.upcomingReservations.length > 0 && <div className="mt-2 border-t border-white/[0.06] pt-1.5"><p className="text-[9px] uppercase tracking-wide text-white/35">{detail.bookings}</p>
                  {table.upcomingReservations.slice(0, 3).map((booking, index) => <p key={`${booking.reservedAt}:${index}`} className="mt-0.5 tabular-nums text-amber-100/75">{bookingTime(booking.reservedAt)} · {booking.partySize} {detail.guests}</p>)}
                  {table.upcomingReservations.length > 3 && <details className="mt-1 text-white/50"><summary className="min-h-7 cursor-pointer py-1">+{table.upcomingReservations.length - 3}</summary>
                    {table.upcomingReservations.slice(3).map((booking, index) => <p key={`${booking.reservedAt}:${index}`} className="mt-0.5 tabular-nums text-amber-100/75">{bookingTime(booking.reservedAt)} · {booking.partySize} {detail.guests}</p>)}
                  </details>}
                </div>}
              </div>
              {staff && <button type="button" disabled={busyId !== null} onClick={() => void block(table.id, !table.blocked)} aria-label={`${table.blocked ? copy.unlock : copy.lock} ${table.label}`}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-white/50 hover:bg-white/10 disabled:opacity-30">
                {table.blocked ? <UnlockKeyhole className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
              </button>}
            </div>)}
          </div>
        </motion.div>}
      </AnimatePresence>
    </section>
  );
}
