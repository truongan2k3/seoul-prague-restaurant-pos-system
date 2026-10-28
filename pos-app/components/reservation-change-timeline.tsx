"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { History } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import { reservationStatusLabelKey } from "@/lib/reservation-analytics";
import { parseReservationBbqNotes, pickEventTypeLabel } from "@/lib/reservation-guest-form";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { ReservationRecord, ReservationStatus } from "@/lib/types";

type ChangeEvent = {
  id: string; changed_at: string;
  changes: Record<string, { before: string | number | null; after: string | number | null }>;
};
const fieldLabels: Record<string, TranslationKey> = {
  guest_name: "guestName", guest_phone: "guestPhone", guest_email: "guestEmail",
  party_size: "partySize", reserved_at: "reservedAt", notes: "resNotes", event_type: "resEventType",
  wants_grill: "mapResTickerBbqYes", referral_code: "resReferralCode", status: "summaryGuestStatus",
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
  const valueLabel = (field: string, value: string | number | null) => {
    if (value == null || value === "") return "—";
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

  return <section className="rounded-2xl border border-[#C9A88B]/25 bg-[#C9A88B]/[0.04] p-4">
    <h4 className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4 text-[#C9A88B]" aria-hidden />{translate("resTimelineTitle")}</h4>
    {loading && <p role="status" className="mt-3 text-xs text-[var(--muted)]">{translate("resTimelineLoading")}</p>}
    {error && <div role="status" className="mt-3 text-xs text-amber-700 dark:text-amber-200">
      {translate(error === "setup" ? "resTimelineSetup" : "resTimelineError")}
      {error === "load" && <button type="button" onClick={() => void load()} className="ml-2 min-h-10 underline">{translate("resCapacityRefresh")}</button>}
    </div>}
    <ol className="relative ml-1 mt-4 space-y-5 border-l border-[#C9A88B]/30 pl-5">
      {events.map(event => <li key={event.id} className="relative">
        <span aria-hidden className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-[#C9A88B] ring-4 ring-[var(--background)]" />
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-semibold">{translate(event.changes.status?.after === "cancelled" ? "resTimelineGuestCancelled" : "resTimelineGuestUpdated")}</p>
          <time dateTime={event.changed_at} className="text-[11px] text-[var(--muted)]">{formatTime(event.changed_at)}</time>
        </div>
        <dl className="mt-2 space-y-2">
          {Object.entries(event.changes).map(([field, change]) => <div key={field} className="rounded-lg bg-[var(--accent)]/40 px-3 py-2 text-xs leading-relaxed">
            <dt className="mb-1 font-medium text-[var(--muted)]">{fieldLabels[field] ? translate(fieldLabels[field]) : field}</dt>
            <dd className="flex flex-wrap items-start gap-x-2 gap-y-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              <span aria-label={translate("resTimelineBefore")} className="text-[var(--muted)]">{valueLabel(field, change.before)}</span>
              <span aria-hidden className="text-[#C9A88B]">→</span>
              <span aria-label={translate("resTimelineAfter")} className="font-semibold">{valueLabel(field, change.after)}</span>
            </dd>
          </div>)}
        </dl>
      </li>)}
      {!hasMore && !loading && !error && <>
        {events.length === 0 && reservation.guestChangedAt && <li className="text-xs text-[var(--muted)]">
          <p className="font-medium">{translate("resTimelineGuestUpdated")} · {formatTime(reservation.guestChangedAt)}</p>
          <p className="mt-1">{translate("resTimelineLegacy")}</p>
        </li>}
        <li className="relative flex flex-wrap items-baseline justify-between gap-2 text-xs">
          <span aria-hidden className="absolute -left-[25px] top-1 h-2 w-2 rounded-full border border-[#C9A88B] bg-[var(--background)]" />
          <span className="font-medium">{translate("resTimelineCreated")}</span>
          <span className="text-[11px] text-[var(--muted)]">{formatTime(reservation.guestSubmittedAt ?? reservation.createdAt)}</span>
        </li>
      </>}
    </ol>
    {hasMore && <button type="button" disabled={loading} onClick={() => void load(events.length)} className="mt-4 min-h-11 w-full rounded-lg border border-[#C9A88B]/30 text-xs font-medium disabled:opacity-40">{translate("resTimelineMore")}</button>}
  </section>;
}
