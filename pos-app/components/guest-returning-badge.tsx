"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Star } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { GuestVisitProfile } from "@/src/lib/guest-history-actions";
import { fetchGuestVisitProfile } from "@/src/lib/guest-history-actions";

type GuestReturningBadgeProps = {
  email?: string | null;
  phone?: string | null;
  excludeReservationId?: string | null;
  /** Compact badge only (no expandable history). */
  compact?: boolean;
  /** Start with visit history expanded. */
  defaultOpen?: boolean;
  /** Optional external profile to skip fetch. */
  profile?: GuestVisitProfile | null;
};

function visitOrdinalLabel(
  n: number,
  translate: (key: TranslationKey) => string,
): string {
  if (n === 2) return translate("guestVisit2nd");
  if (n === 3) return translate("guestVisit3rd");
  return translate("guestVisitNth").replace("{n}", String(n));
}

export function GuestReturningBadge({
  email,
  phone,
  excludeReservationId,
  compact = false,
  defaultOpen = false,
  profile: externalProfile,
}: GuestReturningBadgeProps) {
  const { translate, language } = useApp();
  const [profile, setProfile] = useState<GuestVisitProfile | null>(externalProfile ?? null);
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (externalProfile !== undefined) {
      setProfile(externalProfile);
      return;
    }
    if (!email && !phone) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    void fetchGuestVisitProfile({ email, phone, excludeReservationId }).then(({ data }) => {
      if (!cancelled) setProfile(data.isReturning ? data : null);
    });
    return () => {
      cancelled = true;
    };
  }, [email, phone, excludeReservationId, externalProfile]);

  if (!profile?.isReturning) return null;

  const locale = language === "cs" ? "cs-CZ" : language === "zh" ? "zh-CN" : "en-GB";
  const badgeLabel = `${translate("guestReturningBadge")} · ${visitOrdinalLabel(profile.currentVisitNumber, translate)}`;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => {
          if (!compact) setOpen((value) => !value);
        }}
        className={`inline-flex max-w-full items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-950 dark:bg-amber-950 dark:text-amber-100 ${
          compact ? "cursor-default" : "hover:bg-amber-200 dark:hover:bg-amber-900"
        }`}
        title={translate("guestReturningHint")}
        aria-expanded={compact ? undefined : open}
      >
        <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-600 dark:fill-amber-400 dark:text-amber-300" />
        <span className="truncate">{badgeLabel}</span>
        {!compact ? (
          open ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : null}
      </button>

      {!compact && open ? (
        <ul className="mt-2 space-y-1.5 rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <li className="font-semibold">{translate("guestVisitHistory")}</li>
          {profile.visits.map((visit) => (
            <li key={`${visit.kind}-${visit.id}`} className="flex flex-wrap gap-x-2 text-amber-900/90 dark:text-amber-100/90">
              <span>
                {new Date(visit.at).toLocaleString(locale, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span>· {visit.guestName}</span>
              {visit.partySize != null ? (
                <span>
                  · {visit.partySize} {translate("partySize").toLowerCase()}
                </span>
              ) : null}
              {visit.tableLabel ? <span>· {translate("table")} {visit.tableLabel}</span> : null}
              <span className="opacity-70">
                · {visit.kind === "sale" ? translate("guestVisitSale") : translate("guestVisitReservation")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
