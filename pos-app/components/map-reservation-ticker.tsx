"use client";

import { useMemo, useState, type PointerEvent, type ReactNode } from "react";
import { CalendarClock, ChevronDown, ChevronUp, GripVertical, Loader2, MapPin, Users, Unlink } from "lucide-react";
import { UNASSIGN_DROP_TARGET } from "@/hooks/use-reservation-map-assignment";
import { CompactReservationTicker } from "@/components/compact-reservation-ticker";
import { useApp } from "@/contexts/app-context";
import { reservationStatusLabelKey, reservationStatusTone } from "@/lib/reservation-analytics";
import { parseReservationBbqNotes } from "@/lib/reservation-guest-form";
import { reservationOnVenueDateIso } from "@/lib/reservation-floor-display";
import { formatInVenueTz, todayIsoDateInVenue } from "@/lib/venue-timezone";
import type { ReservationRecord } from "@/lib/types";

type MapReservationTickerProps = {
  reservations: ReservationRecord[]; selectedId?: string | null; busyId?: string | null; disabled?: boolean;
  onSelect?: (id: string) => void;
  onPointerDown?: (id: string, event: PointerEvent<HTMLButtonElement>) => void;
  onCollapse?: () => void;
  onUnassign?: () => void;
  unassignTargeted?: boolean;
};

/** Uses parent data; assignment controls are available only on the floor map. */
export function MapReservationTicker(props: MapReservationTickerProps) {
  const { translate } = useApp();
  const [expanded, setExpanded] = useState(false);
  const canExpand = Boolean(props.onSelect && props.onPointerDown);
  const action = canExpand ? <button type="button" aria-expanded={expanded}
    disabled={props.disabled || props.busyId != null}
    onClick={() => {
      if (expanded) props.onCollapse?.();
      setExpanded((value) => !value);
    }}
    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 text-[11px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--accent)] disabled:opacity-40">
    {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
    {translate(expanded ? "mapResCollapse" : "mapResExpand")}
  </button> : null;

  return canExpand && expanded
    ? <ReservationAssignmentCards {...props} headerAction={action} />
    : <CompactReservationTicker reservations={props.reservations} action={action} />;
}

function ReservationAssignmentCards({ reservations, selectedId = null, busyId = null, disabled = false, onSelect, onPointerDown, onUnassign, unassignTargeted, headerAction }: MapReservationTickerProps & { headerAction?: ReactNode }) {
  const { translate, language } = useApp();
  const today = todayIsoDateInVenue();
  const rows = useMemo(() => reservations.filter((row) => row.source !== "walk_in"
    && ["pending", "confirmed", "late"].includes(row.status) && reservationOnVenueDateIso(row.reservedAt, today))
    .sort((a, b) => a.reservedAt.getTime() - b.reservedAt.getTime()), [reservations, today]);
  if (!rows.length) return null;
  return (
    <aside className="shrink-0 border-t border-[var(--border)] bg-[var(--pos-raised)] px-3 py-2 sm:px-5">
      <div className="mb-1.5 flex items-center gap-2">
        <CalendarClock className="h-3.5 w-3.5 text-[#C9A88B]" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">{translate("mapResTickerTitle")}</span>
        <span className="rounded-full bg-[#C9A88B]/10 px-1.5 text-[10px] tabular-nums text-[#C9A88B]">{rows.length}</span>
        {onSelect && <p className="ml-auto hidden text-[10px] text-[var(--muted)] sm:block">{translate("mapResAssignHint")}</p>}
        <div className="ml-auto shrink-0">{headerAction}</div>
      </div>
      <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]">
        {onUnassign && <button type="button" data-reservation-drop-table={UNASSIGN_DROP_TARGET}
          disabled={disabled || busyId !== null} onClick={onUnassign}
          style={{ backgroundColor: "var(--card)" }}
          className={`sticky left-0 z-10 flex w-44 shrink-0 flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-3 text-center transition-colors disabled:opacity-40 ${unassignTargeted ? "border-rose-400 bg-rose-400/20 text-rose-400" : "border-[#C9A88B]/35 bg-[#C9A88B]/5 text-[var(--muted)] hover:border-rose-400/60 hover:text-rose-400"}`}>
          <Unlink aria-hidden className="h-5 w-5" /><span className="text-xs font-semibold">{translate("mapResUnassignDrop")}</span>
          <span className="text-[10px] leading-relaxed opacity-65">{translate("mapResUnassignHint")}</span>
        </button>}
        {rows.map((row) => {
          const selected = row.id === selectedId;
          const bbq = row.wantsGrill ?? parseReservationBbqNotes(row.notes).bbq;
          const content = <>
            <span className="flex items-center justify-between gap-2"><span className="font-mono text-sm font-semibold tabular-nums text-[var(--foreground)]">{formatInVenueTz(row.reservedAt, language === "cs" ? "cs-CZ" : "en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--muted)]">{busyId === row.id ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" /> : <Users className="h-3 w-3" />}{row.partySize}</span>
            </span>
            <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--foreground)]">{row.guestName}</span>
            <span className="mt-1 flex items-center gap-1.5"><span className={`rounded px-1 py-0.5 text-[8px] font-semibold uppercase ${reservationStatusTone(row.status)}`}>{translate(reservationStatusLabelKey(row.status))}</span>{bbq === "yes" && <span className="text-[9px] text-orange-400">BBQ</span>}</span>
            <span className="mt-1 flex items-center gap-1 truncate text-[10px] text-[var(--muted)]"><MapPin className="h-2.5 w-2.5 shrink-0" />{row.tableLabel || translate("mapResTickerNoTable")}</span>
          </>;
          return <div key={row.id} className={`flex w-52 shrink-0 overflow-hidden rounded-xl border transition-colors motion-reduce:transition-none ${selected ? "border-[#C9A88B] bg-[#C9A88B]/15 shadow-[0_0_12px_rgba(201,168,139,0.1)]" : "border-[var(--border)] bg-[var(--card)]"}`}>
            {onPointerDown && <button type="button" tabIndex={-1} disabled={disabled || busyId !== null}
              onPointerDown={(event) => onPointerDown(row.id, event)} onClick={(event) => event.preventDefault()}
              aria-label={`${translate("mapResDragHandle")}: ${row.guestName}`}
              className="flex w-11 shrink-0 touch-none select-none items-center justify-center border-r border-[var(--border)] text-[var(--muted)] hover:bg-[#C9A88B]/10 active:cursor-grabbing disabled:opacity-30" style={{ cursor: "grab" }}>
              <GripVertical className="h-4 w-4" />
            </button>}
            {onSelect ? <button type="button" aria-pressed={selected} disabled={disabled || busyId !== null} onClick={() => onSelect(row.id)}
              title={[row.guestName, row.bookingCode, row.notes].filter(Boolean).join(" · ")}
              className="min-w-0 flex-1 px-2.5 py-2 text-left disabled:opacity-50">
              {content}
            </button> : <div className="min-w-0 flex-1 px-2.5 py-2 text-left" title={[row.guestName, row.bookingCode, row.notes].filter(Boolean).join(" · ")}>{content}</div>}
          </div>;
        })}
      </div>
    </aside>
  );
}
