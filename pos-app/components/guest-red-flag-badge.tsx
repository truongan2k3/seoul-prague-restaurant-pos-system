"use client";

import { useEffect, useState } from "react";
import { AlertOctagon, ChevronDown, ChevronUp, Clock, Flag, XCircle } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import {
  type GuestRedFlagReport,
  formatRedFlagIncidentDescription,
  formatRedFlagSummary,
} from "@/lib/reservation-red-flag";
import { fetchGuestRedFlags, guestVisitProfileKey } from "@/src/lib/guest-history-actions";

export type GuestRedFlagBadgeProps = {
  email?: string | null;
  phone?: string | null;
  excludeReservationId?: string | null;
  beforeAt?: string | Date | null;
  /** Compact badge only (e.g. for header pill: "🚩 RED FLAG"). */
  compact?: boolean;
  /** Start with incident list expanded. */
  defaultOpen?: boolean;
  /** Optional external report to avoid fetching. */
  profile?: GuestRedFlagReport | null;
  className?: string;
  onLoaded?: (report: GuestRedFlagReport) => void;
};

export function GuestRedFlagBadge({
  email,
  phone,
  excludeReservationId,
  beforeAt,
  compact = false,
  defaultOpen = false,
  profile: externalProfile,
  className = "",
  onLoaded,
}: GuestRedFlagBadgeProps) {
  const { translate, language } = useApp();
  const lookupKey = guestVisitProfileKey({ email, phone, excludeReservationId, beforeAt });
  const [loaded, setLoaded] = useState<{ key: string; report: GuestRedFlagReport | null } | null>(null);
  const report = externalProfile !== undefined ? externalProfile : loaded?.key === lookupKey ? loaded.report : null;
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(defaultOpen);
    if (externalProfile !== undefined) return;
    if (!email && !phone) {
      setLoaded(null);
      return;
    }
    let cancelled = false;
    void fetchGuestRedFlags({ email, phone, excludeReservationId, beforeAt }).then(({ data }) => {
      if (!cancelled) {
        setLoaded({ key: lookupKey, report: data.hasRedFlag ? data : null });
        if (data.hasRedFlag && onLoaded) {
          onLoaded(data);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lookupKey, externalProfile, defaultOpen, email, phone, excludeReservationId, beforeAt, onLoaded]);

  if (!report?.hasRedFlag) return null;

  const summary = formatRedFlagSummary(report, language);
  const titleText = `${translate("guestRedFlagTitle")}: ${summary}`;

  if (compact) {
    return (
      <span
        title={titleText}
        className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm sm:text-xs ${className}`}
      >
        <Flag className="h-3 w-3 fill-white text-white shrink-0" />
        <span>{translate("guestRedFlagBadge")}</span>
      </span>
    );
  }

  return (
    <div
      className={`mt-2 rounded-xl border border-rose-300 bg-rose-50/95 p-3 text-xs text-rose-950 shadow-sm dark:border-rose-900/80 dark:bg-rose-950/40 dark:text-rose-100 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-bold text-rose-700 dark:text-rose-300">
          <Flag className="h-4 w-4 fill-rose-600 text-rose-600 dark:fill-rose-400 dark:text-rose-400 shrink-0" />
          <span>{translate("guestRedFlagTitle")}</span>
          <span className="font-semibold text-rose-900/85 dark:text-rose-200/85 text-[11px] sm:text-xs">
            ({summary})
          </span>
        </div>
        {report.incidents.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 hover:text-rose-900 hover:underline dark:text-rose-300 dark:hover:text-rose-100"
            aria-expanded={open}
          >
            <span>{open ? translate("guestRedFlagCollapse") : translate("guestRedFlagDetails")}</span>
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {open && report.incidents.length > 0 && (
        <ul className="mt-2.5 space-y-1.5 border-t border-rose-200/80 pt-2 dark:border-rose-900/60">
          {report.incidents.map((incident) => (
            <li
              key={incident.reservationId}
              className="flex flex-col gap-0.5 rounded-lg bg-white/70 p-2 shadow-xs dark:bg-rose-900/20"
            >
              <div className="flex items-start gap-1.5 font-medium text-rose-950 dark:text-rose-100">
                <span className="shrink-0 mt-0.5">
                  {incident.type === "no_show" ? (
                    <AlertOctagon className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                  ) : incident.type === "late_cancellation" ? (
                    <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-rose-500 dark:text-rose-400" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="leading-snug">
                    {formatRedFlagIncidentDescription(incident, language)}
                  </p>
                  {incident.note && (
                    <p className="mt-1 italic text-[11px] text-rose-800/80 dark:text-rose-300/80">
                      &ldquo;{incident.note}&rdquo;
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
