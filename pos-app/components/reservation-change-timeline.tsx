"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { History } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import { reservationStatusLabelKey } from "@/lib/reservation-analytics";
import { parseReservationBbqNotes, pickEventTypeLabel } from "@/lib/reservation-guest-form";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { ReservationRecord, ReservationStatus } from "@/lib/types";
import { reservationTableLabels } from "@/lib/reservation-tables";

type ChangeValue = string | number | string[] | null;
type ChangeEvent = {
  id: string; changed_at: string; event_kind?: string; legacy?: boolean;
  changes: Record<string, { before: ChangeValue; after: ChangeValue }>;
};
const fieldLabels: Record<string, TranslationKey> = {
  guest_name: "guestName", guest_phone: "guestPhone", guest_email: "guestEmail",
  party_size: "partySize", reserved_at: "reservedAt", notes: "resNotes", event_type: "resEventType",
  wants_grill: "mapResTickerBbqYes", referral_code: "resReferralCode", status: "summaryGuestStatus",
  actual_party_size: "resActualPartySize", table_labels: "table",
};

export function ReservationChangeTimeline({ reservation }: { reservation: ReservationRecord }) {
  const { translate, language } = useApp();
  const { settings } = useSettings();
  const [events, setEvents] = useState<ChangeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"load" | "setup" | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const version = reservation.updatedAt.getTime();
  const load = useCallback(async (offset = 0) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const current = ++sequence.current;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/reservations/history?reservationId=${encodeURIComponent(reservation.id)}&offset=${offset}`,
        { signal: controller.signal, cache: "no-store" });
      const payload = await response.json() as { events?: ChangeEvent[]; hasMore?: boolean; setupRequired?: boolean };
      if (controller.signal.aborted || current !== sequence.current) return;
      if (!response.ok || !payload.events) { setError(payload.setupRequired ? "setup" : "load"); return; }
      setEvents(previous => offset === 0 ? payload.events! : [...new Map([...previous, ...payload.events!].map(event => [event.id, event])).values()]);
      setHasMore(payload.hasMore === true);
    } catch {
      if (!controller.signal.aborted && current === sequence.current) setError("load");
    } finally {
      if (!controller.signal.aborted && current === sequence.current) setLoading(false);
    }
  }, [reservation.id]);
  useEffect(() => {
    void load();
    return () => { ++sequence.current; request.current?.abort(); };
  }, [load, version]);

  const formatTime = (value: string | Date) => {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(language === "cs" ? "cs-CZ" : language === "vi" ? "vi-VN" : "en-GB", {
      timeZone: "Europe/Prague", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(date) : "—";
  };
  const valueLabel = (field: string, value: ChangeValue) => {
    if (value == null || value === "") return "—";
    if (Array.isArray(value)) return value.join(" · ") || "—";
    if (field === "reserved_at") return formatTime(String(value));
    if (field === "status" && ["pending", "confirmed", "late", "checked_in", "completed", "cancelled", "no_show"].includes(String(value)))
      return translate(reservationStatusLabelKey(value as ReservationStatus));
    if (field === "wants_grill" && ["yes", "no"].includes(String(value))) return translate(value === "yes" ? "mapResTickerBbqYes" : "mapResTickerBbqNo");
    if (field === "notes") {
      const parsed = parseReservationBbqNotes(String(value));
      return [parsed.bbq === "yes" ? translate("mapResTickerBbqYes") : parsed.bbq === "no" ? translate("mapResTickerBbqNo") : null, parsed.noteText].filter(Boolean).join(" · ") || "—";
    }
    if (field === "event_type") {
      const option = settings.reservationEventTypes.find(item => item.id === value);
      if (option) return pickEventTypeLabel(option, language === "cs" ? "cs" : language === "vi" ? "vi" : "en");
    }
    return String(value);
  };

  const seatedTables = reservation.seatedTableLabels?.length ? reservation.seatedTableLabels : reservationTableLabels(reservation);
  const timeline: ChangeEvent[] = [...events];
  const hasKind = (kind: string) => events.some(event => event.event_kind === kind);
  if (!hasKind("created")) timeline.unshift({ id: "created", event_kind: "created",
    changed_at: (reservation.guestSubmittedAt ?? reservation.createdAt).toISOString(), changes: {} });
  if (!hasMore && !loading) {
    if (reservation.checkedInAt && !hasKind("checked_in")) timeline.push({ id: "checked-in", event_kind: "checked_in", changed_at: reservation.checkedInAt.toISOString(), changes: {} });
    if (reservation.completedAt && !hasKind("completed")) timeline.push({ id: "completed", event_kind: "completed", changed_at: reservation.completedAt.toISOString(), changes: {} });
    if (reservation.cancelledAt && !hasKind("cancelled") && !hasKind("guest_cancelled")
      && !events.some(event => event.changes.status?.after === "cancelled")) timeline.push({ id: "cancelled", event_kind: "cancelled", changed_at: reservation.cancelledAt.toISOString(), changes: {} });
    if (reservation.guestChangedAt && !hasKind("guest_updated") && !hasKind("guest_cancelled")
      && reservation.guestChangedAt.getTime() !== reservation.cancelledAt?.getTime()) timeline.push({ id: "legacy-update", event_kind: "guest_updated", changed_at: reservation.guestChangedAt.toISOString(), changes: {}, legacy: true });
  }
  timeline.sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());
  const eventTitles: Record<string, TranslationKey> = {
    created: "resTimelineCreated", guest_updated: "resTimelineGuestUpdated", guest_cancelled: "resTimelineGuestCancelled",
    assigned: "assignTable", checked_in: "checkIn", completed: "resStatusCompleted", cancelled: "resStatusCancelled",
    tables_changed: "resTimelineTablesChanged", status_changed: "resTimelineStatusChanged", staff_updated: "resTimelineStaffUpdated",
  };
  const notes = parseReservationBbqNotes(reservation.notes);
  const bbq = reservation.wantsGrill ?? notes.bbq;

  return <section>
    <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]"><History className="h-4 w-4 text-[#C9A88B]" aria-hidden />{translate("resTimelineTitle")}</h4>
    {loading && <p role="status" className="mt-3 text-xs text-[var(--muted)]">{translate("resTimelineLoading")}</p>}
    {error && <div role="status" className="mt-3 text-xs text-amber-700 dark:text-amber-200">
      {translate(error === "setup" ? "resTimelineSetup" : "resTimelineError")}
      {error === "load" && <button type="button" onClick={() => void load()} className="ml-2 min-h-10 underline">{translate("resCapacityRefresh")}</button>}
    </div>}
    <ol className="relative ml-2 mt-5 space-y-4 border-l border-[#C9A88B]/25 pl-6">
      {timeline.map(event => {
        const kind = event.event_kind ?? "guest_updated";
        const completed = kind === "completed";
        const cancelled = kind === "cancelled" || kind === "guest_cancelled" || event.changes.status?.after === "cancelled";
        const title = kind === "guest_updated" && event.changes.status?.after === "cancelled" ? "resTimelineGuestCancelled" : eventTitles[kind] ?? "resTimelineStaffUpdated";
        return <li key={event.id} className="relative">
          <span aria-hidden className={`absolute -left-[29px] top-5 h-2.5 w-2.5 rounded-full ring-4 ring-[var(--background)] ${completed ? "bg-emerald-400" : cancelled ? "bg-red-400" : "bg-[#C9A88B]"}`} />
          <div className={`rounded-2xl border p-4 ${completed ? "border-emerald-400/25 bg-emerald-400/[0.06]" : cancelled ? "border-red-400/20 bg-red-400/[0.04]" : "border-[var(--border)] bg-[var(--accent)]/20"}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className={`text-sm font-semibold ${completed ? "text-emerald-700 dark:text-emerald-300" : ""}`}>{translate(title)}</p>
              <time dateTime={event.changed_at} className="text-[11px] tabular-nums text-[var(--muted)]">{formatTime(event.changed_at)}</time>
            </div>
            {event.legacy && <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{translate("resTimelineLegacy")}</p>}
            {Object.keys(event.changes).length > 0 && <dl className="mt-3 space-y-2">
              {Object.entries(event.changes).map(([field, change]) => <div key={field} className="text-xs leading-relaxed">
                <dt className="mb-1 font-medium text-[var(--muted)]">{fieldLabels[field] ? translate(fieldLabels[field]) : field}</dt>
                <dd className="flex flex-wrap items-start gap-x-2 gap-y-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {kind !== "created" && <><span aria-label={translate("resTimelineBefore")} className="text-[var(--muted)]">{valueLabel(field, change.before)}</span><span aria-hidden className="text-[#C9A88B]">→</span></>}
                  <span aria-label={translate("resTimelineAfter")} className="font-semibold">{valueLabel(field, change.after)}</span>
                </dd>
              </div>)}
            </dl>}
            {completed && seatedTables.length > 0 && <div className="mt-3 border-t border-emerald-400/15 pt-3"><p className="text-[11px] text-[var(--muted)]">{translate("resTimelineSeatedTables")}</p><p className="pos-serif mt-1 text-xl font-semibold">{seatedTables.join(" · ")}</p></div>}
            {cancelled && <div className="mt-2 space-y-1 text-xs text-[var(--muted)]">
              {reservation.cancelledBy && <p>{reservation.cancelledBy}</p>}
              {reservation.cancellationReason && <p>{reservation.cancellationReason}</p>}
              {reservation.cancellationNote && <p className="whitespace-pre-wrap break-words">{reservation.cancellationNote}</p>}
            </div>}
          </div>
        </li>;
      })}
      <li className="relative">
        <span aria-hidden className="absolute -left-[29px] top-5 h-2.5 w-2.5 rounded-full border border-[#C9A88B] bg-[var(--background)] ring-4 ring-[var(--background)]" />
        <div className="space-y-3 rounded-2xl border border-[#C9A88B]/25 bg-[#C9A88B]/[0.04] p-4">
          <p className="text-sm font-semibold">{translate("resTimelineCurrent")}</p>
          <dl className="grid gap-3 text-xs sm:grid-cols-2">
            {[
              [translate("reservationSource"), translate(({ reservation: "resSourceReservation", online: "resSourceOnline", phone_call: "resSourcePhoneCall", walk_in: "resSourceWalkIn" } as const)[reservation.source])],
              [translate("resEventType"), valueLabel("event_type", reservation.eventType ?? null)],
              [translate("resReferralCode"), reservation.referralCode || "—"],
              [translate("staff"), reservation.staffName || "—"],
            ].map(([label, value]) => <div key={label}><dt className="text-[var(--muted)]">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}
          </dl>
          {bbq && <p className="text-xs font-semibold text-[#C9A88B]">{translate(bbq === "yes" ? "mapResTickerBbqYes" : bbq === "no" ? "mapResTickerBbqNo" : "resBbqUndecided")}</p>}
          <div className="border-t border-[var(--border)] pt-3"><p className="text-[11px] text-[var(--muted)]">{translate("resNotes")}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{notes.noteText || "—"}</p></div>
          {reservation.status === "cancelled" && !timeline.some(event => ["cancelled", "guest_cancelled"].includes(event.event_kind ?? "") || event.changes.status?.after === "cancelled") && <div className="space-y-1 border-t border-red-400/20 pt-3 text-xs text-red-700 dark:text-red-200">
            <p className="font-semibold">{translate("resStatusCancelled")}</p>
            {reservation.cancelledBy && <p>{reservation.cancelledBy}</p>}
            {reservation.cancellationReason && <p>{reservation.cancellationReason}</p>}
            {reservation.cancellationNote && <p className="whitespace-pre-wrap break-words">{reservation.cancellationNote}</p>}
          </div>}
        </div>
      </li>
    </ol>
    {hasMore && <button type="button" disabled={loading} onClick={() => void load(events.length)} className="mt-4 min-h-11 w-full rounded-lg border border-[#C9A88B]/30 text-xs font-medium disabled:opacity-40">{translate("resTimelineMore")}</button>}
  </section>;
}
