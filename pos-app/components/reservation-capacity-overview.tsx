"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import type { SlotAvailability } from "@/lib/reservation-capacity-engine";
import {
  groupCapacityTimelineSegments,
  type CapacityAvailabilitySegment,
} from "@/lib/reservation-capacity-segments";
import type { StaffCapacitySlotDetail, StaffPartySizeSummary } from "@/src/lib/reservation-guest-server";

type GrillFilter = "flex" | "yes" | "no" | "undecided";

type OverviewPayload = {
  date: string;
  partySize: number;
  maxGuestsPerSlot: number;
  slots: StaffCapacitySlotDetail[];
  summary: { available: number; limited: number; full: number; total: number };
  partySizeSummaries: StaffPartySizeSummary[];
};

function availabilityTone(status: SlotAvailability): string {
  switch (status) {
    case "available":
      return "bg-emerald-500/90 dark:bg-emerald-600";
    case "limited":
      return "bg-amber-400 dark:bg-amber-500";
    case "full":
      return "bg-rose-500 dark:bg-rose-600";
    default:
      return "bg-gray-400";
  }
}

function availabilityChipClass(status: SlotAvailability): string {
  switch (status) {
    case "available":
      return "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100";
    case "limited":
      return "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100";
    case "full":
      return "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/35 dark:text-rose-100";
    default:
      return "border-gray-200 bg-gray-50 text-gray-800";
  }
}

function segmentRangeLabel(segment: CapacityAvailabilitySegment): string {
  if (segment.startTime === segment.endTime) return segment.startTime;
  return `${segment.startTime} – ${segment.endTime}`;
}

function grillQueryValue(filter: GrillFilter): string | null {
  if (filter === "flex") return null;
  return filter;
}

interface ReservationCapacityOverviewProps {
  dateIso: string;
  /** Bumps when reservations reload; combine with floor occupancy for live POS blocks. */
  refreshKey?: number;
  floorOccupiedCount?: number;
}

export function ReservationCapacityOverview({
  dateIso,
  refreshKey = 0,
  floorOccupiedCount = 0,
}: ReservationCapacityOverviewProps) {
  const { translate } = useApp();
  const [partySize, setPartySize] = useState(4);
  const [grillFilter, setGrillFilter] = useState<GrillFilter>("flex");
  const [payload, setPayload] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(true);

  const load = useCallback(async () => {
    if (!dateIso) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      date: dateIso,
      partySize: String(partySize),
    });
    const grill = grillQueryValue(grillFilter);
    if (grill) params.set("grill", grill);

    try {
      const response = await fetch(`/api/reservations/capacity/overview?${params.toString()}`);
      const data = (await response.json().catch(() => ({}))) as OverviewPayload & { error?: string };
      if (!response.ok) {
        setError(data.error ?? translate("resCapacityLoadFailed"));
        setPayload(null);
        return;
      }
      setPayload(data);
    } catch {
      setError(translate("resCapacityLoadFailed"));
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [dateIso, grillFilter, partySize, translate]);

  useEffect(() => {
    void load();
  }, [load, refreshKey, floorOccupiedCount]);

  const timelineSlots = useMemo(
    () => payload?.slots.map((row) => ({ time: row.time, availability: row.availability })) ?? [],
    [payload],
  );

  const segments = useMemo(() => groupCapacityTimelineSegments(timelineSlots), [timelineSlots]);

  const constrainedSegments = useMemo(
    () => segments.filter((row) => row.availability !== "available"),
    [segments],
  );

  const constrainedSlots = useMemo(
    () => payload?.slots.filter((row) => row.availability !== "available") ?? [],
    [payload],
  );

  const statusLabel = (status: SlotAvailability) => {
    if (status === "full") return translate("resCapacityFull");
    if (status === "limited") return translate("resCapacityLimited");
    return translate("resCapacityAvailable");
  };

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-br from-white via-white to-gray-50/80 shadow-sm dark:border-gray-700 dark:from-gray-800 dark:via-gray-800 dark:to-gray-900/80">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200/80 px-3 py-3 dark:border-gray-700/80 sm:px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900">
              <Activity className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 sm:text-base">
                {translate("resCapacityOverviewTitle")}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">{translate("resCapacityOverviewHint")}</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {translate("resCapacityRefresh")}
        </button>
      </div>

      <div className="space-y-4 px-3 py-3 sm:px-4 sm:py-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {translate("resCapacityPreviewParty")}
            <select
              value={partySize}
              onChange={(event) => setPartySize(Number(event.target.value))}
              className="mt-1 block min-w-[5.5rem] rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-semibold tabular-nums text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: "flex" as const, label: translate("resCapacityGrillFlex") },
                { id: "yes" as const, label: translate("resCapacityGrillYes") },
                { id: "no" as const, label: translate("resCapacityGrillNo") },
                { id: "undecided" as const, label: translate("resCapacityGrillUndecided") },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setGrillFilter(option.id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition sm:text-xs ${
                  grillFilter === option.id
                    ? "border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        ) : null}

        {loading && !payload ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{translate("resCapacityLoading")}</p>
        ) : null}

        {payload ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  {
                    key: "available" as const,
                    label: translate("resCapacitySlotsAvailable"),
                    value: payload.summary.available,
                  },
                  {
                    key: "limited" as const,
                    label: translate("resCapacitySlotsLimited"),
                    value: payload.summary.limited,
                  },
                  {
                    key: "full" as const,
                    label: translate("resCapacitySlotsFull"),
                    value: payload.summary.full,
                  },
                  {
                    key: "max" as const,
                    label: translate("resCapacityMaxPerSlot"),
                    value: payload.maxGuestsPerSlot,
                  },
                ] as const
              ).map((card) => (
                <div
                  key={card.key}
                  className={`rounded-xl border p-3 ${
                    card.key === "available"
                      ? availabilityChipClass("available")
                      : card.key === "limited"
                        ? availabilityChipClass("limited")
                        : card.key === "full"
                          ? availabilityChipClass("full")
                          : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/50"
                  }`}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">{card.label}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{card.value}</p>
                  {card.key !== "max" ? (
                    <p className="mt-0.5 text-[11px] opacity-70">
                      / {payload.summary.total} {translate("resCapacityTimeline").toLowerCase()}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>

            {payload.partySizeSummaries.length > 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white/70 p-3 dark:border-gray-700 dark:bg-gray-900/40">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {translate("resCapacityByParty")}
                </p>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {payload.partySizeSummaries.map((row) => (
                    <button
                      key={row.partySize}
                      type="button"
                      onClick={() => setPartySize(row.partySize)}
                      className={`min-w-[7.5rem] shrink-0 rounded-lg border px-2.5 py-2 text-left transition ${
                        row.partySize === partySize
                          ? "border-gray-900 ring-1 ring-gray-900 dark:border-gray-100 dark:ring-gray-100"
                          : "border-gray-200 hover:border-gray-300 dark:border-gray-600 dark:hover:border-gray-500"
                      }`}
                    >
                      <p className="text-xs font-bold tabular-nums text-gray-900 dark:text-gray-100">
                        {row.partySize} {translate("partySize").toLowerCase()}
                      </p>
                      <p className="mt-1 flex flex-wrap gap-1 text-[10px] font-semibold">
                        <span className="text-emerald-700 dark:text-emerald-300">{row.available} A</span>
                        <span className="text-amber-700 dark:text-amber-300">{row.limited} L</span>
                        <span className="text-rose-700 dark:text-rose-300">{row.full} F</span>
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {translate("resCapacityTimeline")}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase text-gray-500 dark:text-gray-400">
                  <span className="inline-flex items-center gap-1">
                    <span className={`h-2 w-2 rounded-sm ${availabilityTone("available")}`} />
                    {translate("resCapacityAvailable")}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className={`h-2 w-2 rounded-sm ${availabilityTone("limited")}`} />
                    {translate("resCapacityLimited")}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className={`h-2 w-2 rounded-sm ${availabilityTone("full")}`} />
                    {translate("resCapacityFull")}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-0.5 rounded-lg border border-gray-200 bg-gray-100/80 p-2 dark:border-gray-700 dark:bg-gray-950/50">
                {timelineSlots.map((slot) => (
                  <div
                    key={slot.time}
                    title={`${slot.time} · ${statusLabel(slot.availability)}`}
                    className={`h-7 min-w-[2px] flex-1 rounded-sm ${availabilityTone(slot.availability)} opacity-90 transition hover:opacity-100 sm:min-w-[4px]`}
                  />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] tabular-nums text-gray-400">
                <span>{timelineSlots[0]?.time}</span>
                <span>{timelineSlots[timelineSlots.length - 1]?.time}</span>
              </div>
            </div>

            {constrainedSegments.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {constrainedSegments.map((segment) => (
                  <span
                    key={`${segment.startTime}-${segment.endTime}-${segment.availability}`}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${availabilityChipClass(segment.availability)}`}
                  >
                    <span className="font-mono tabular-nums">{segmentRangeLabel(segment)}</span>
                    <span>{statusLabel(segment.availability)}</span>
                    <span className="opacity-70">×{segment.slotCount}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-emerald-300/60 bg-emerald-50/50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-100">
                {translate("resCapacityNoConstraints")}
              </p>
            )}

            <button
              type="button"
              onClick={() => setDetailsOpen((open) => !open)}
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
            >
              {translate("resCapacityConstrained")}
              <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500">
                {constrainedSlots.length}
                {detailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
            </button>

            {detailsOpen && constrainedSlots.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                <table className="min-w-full divide-y divide-gray-200 text-left text-xs dark:divide-gray-700">
                  <thead className="bg-gray-50 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:bg-gray-900/80 dark:text-gray-400">
                    <tr>
                      <th className="px-3 py-2">{translate("resCapacityTimeColumn")}</th>
                      <th className="px-3 py-2">{translate("resCapacityWarning")}</th>
                      <th className="px-3 py-2">{translate("resCapacityFreeConfigs")}</th>
                      <th className="px-3 py-2">{translate("resCapacityOverlapGuests")}</th>
                      <th className="px-3 py-2">{translate("resCapacityRemainingSeats")}</th>
                      <th className="px-3 py-2">{translate("resSuggestedSeating")}</th>
                      <th className="px-3 py-2">{translate("resCapacityBlockedTables")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-800/50">
                    {constrainedSlots.map((row) => (
                      <tr key={row.time} className="align-top">
                        <td className="whitespace-nowrap px-3 py-2 font-mono font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                          {row.time}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${availabilityChipClass(row.availability)}`}
                          >
                            {statusLabel(row.availability)}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-semibold tabular-nums">{row.freeConfigurationCount}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {row.overlappingGuestCount}
                          {row.heldGuests > 0 ? (
                            <span className="ml-1 text-[10px] text-gray-500">
                              (+{row.heldGuests} {translate("resCapacityHeld")})
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{row.remainingSeatEstimate}</td>
                        <td className="max-w-[10rem] px-3 py-2 text-gray-700 dark:text-gray-300">
                          {row.recommendationLabel ?? "—"}
                          {row.warnings.length > 0 ? (
                            <ul className="mt-1 list-disc pl-4 text-[10px] text-amber-800 dark:text-amber-200">
                              {row.warnings.map((warning) => (
                                <li key={warning}>{warning}</li>
                              ))}
                            </ul>
                          ) : null}
                        </td>
                        <td className="max-w-[12rem] px-3 py-2">
                          {row.blockedLabels.length > 0 ? (
                            <span className="text-[11px] leading-snug text-gray-600 dark:text-gray-400">
                              {row.blockedLabels.join(", ")}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
