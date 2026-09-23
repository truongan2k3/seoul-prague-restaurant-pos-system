"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Users } from "lucide-react";
import { DateRangeInputs } from "@/components/date-range-inputs";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import { formatPrice } from "@/lib/i18n/translations";
import {
  formatSummaryDate,
  getPeriodRange,
  type DateRange,
  type SummaryPeriod,
} from "@/lib/summary-analytics";
import {
  DEFAULT_GUEST_LIST_FILTERS,
  buildGuestListRows,
  downloadGuestListCsv,
  downloadGuestListExcel,
  filterGuestListRows,
  type GuestBbqFilter,
  type GuestListFilters,
  type GuestListSortKey,
} from "@/lib/summary-guest-list";
import { filterButtonClass } from "@/lib/theme-classes";
import type { MenuItem, ReservationStatus, SaleRecord } from "@/lib/types";
import {
  fetchReservations,
  mapReservationsResponse,
} from "@/src/lib/reservation-actions";

const STATUS_OPTIONS: Array<ReservationStatus | "all"> = [
  "all",
  "pending",
  "confirmed",
  "checked_in",
  "late",
  "completed",
  "cancelled",
  "no_show",
];

const BBQ_OPTIONS: GuestBbqFilter[] = ["all", "ate_bbq", "no_bbq", "no_order"];

const SORT_OPTIONS: GuestListSortKey[] = [
  "reservedAtDesc",
  "reservedAtAsc",
  "nameAsc",
  "partySizeDesc",
  "partySizeAsc",
  "statusAsc",
];

function bbqBadgeClass(status: string): string {
  if (status === "ate_bbq") {
    return "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200";
  }
  if (status === "no_bbq") {
    return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
  }
  return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";
}

export function SummaryGuestListModal({
  open,
  onClose,
  sales,
  menuItems,
  initialPeriod,
  initialCustomFrom,
  initialCustomTo,
}: {
  open: boolean;
  onClose: () => void;
  sales: SaleRecord[];
  menuItems: MenuItem[];
  initialPeriod: SummaryPeriod;
  initialCustomFrom: string;
  initialCustomTo: string;
}) {
  const { translate, language } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<SummaryPeriod>(initialPeriod);
  const [customFrom, setCustomFrom] = useState(initialCustomFrom);
  const [customTo, setCustomTo] = useState(initialCustomTo);
  const [filters, setFilters] = useState<GuestListFilters>(DEFAULT_GUEST_LIST_FILTERS);
  const [rawRows, setRawRows] = useState(() =>
    buildGuestListRows([], sales, menuItems),
  );

  const activeRange: DateRange = useMemo(
    () =>
      getPeriodRange(
        period,
        period === "custom" ? { from: customFrom, to: customTo } : undefined,
      ),
    [period, customFrom, customTo],
  );

  useEffect(() => {
    if (!open) return;
    setPeriod(initialPeriod);
    setCustomFrom(initialCustomFrom);
    setCustomTo(initialCustomTo);
    setFilters(DEFAULT_GUEST_LIST_FILTERS);
  }, [open, initialPeriod, initialCustomFrom, initialCustomTo]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        // Load a wide window so custom range changes stay local/filterable.
        const since = new Date();
        since.setFullYear(since.getFullYear() - 2);
        const { data, error: fetchError } = await fetchReservations(since);
        if (cancelled) return;
        if (fetchError) {
          setError(fetchError.message);
          setRawRows([]);
          return;
        }
        const reservations = mapReservationsResponse(
          data as Parameters<typeof mapReservationsResponse>[0],
        );
        setRawRows(buildGuestListRows(reservations, sales, menuItems));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load guests.");
          setRawRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, sales, menuItems]);

  const rows = useMemo(
    () => filterGuestListRows(rawRows, filters, activeRange),
    [rawRows, filters, activeRange],
  );

  const exportLabels = {
    sheetName: translate("summaryGuestListSheet"),
    guestName: translate("summaryGuestName"),
    email: translate("summaryGuestEmail"),
    phone: translate("summaryGuestPhone"),
    reservedAt: translate("summaryGuestReservedAt"),
    partySize: translate("summaryGuestPartySize"),
    table: translate("summaryGuestTable"),
    status: translate("summaryGuestStatus"),
    source: translate("summaryGuestSource"),
    bookingCode: translate("summaryGuestBookingCode"),
    eventType: translate("summaryGuestEventType"),
    notes: translate("summaryGuestNotes"),
    bbqPreference: translate("summaryGuestBbqPreference"),
    bbqOrder: translate("summaryGuestBbqOrder"),
    saleTotal: translate("summaryGuestSaleTotal"),
    paymentMethod: translate("summaryGuestPayment"),
    grillItems: translate("summaryGuestGrillItems"),
    orderSummary: translate("summaryGuestOrderSummary"),
    period: translate("summaryExcelPeriod"),
    ateBbq: translate("summaryGuestBbqAte"),
    noBbq: translate("summaryGuestBbqNone"),
    noOrder: translate("summaryGuestBbqNoOrder"),
  };

  const periodLabel =
    period === "custom"
      ? `${formatSummaryDate(activeRange.start, language)} – ${formatSummaryDate(activeRange.end, language)}`
      : formatSummaryDate(activeRange.start, language);

  const bbqLabel = (key: GuestBbqFilter) => {
    if (key === "ate_bbq") return translate("summaryGuestBbqAte");
    if (key === "no_bbq") return translate("summaryGuestBbqNone");
    if (key === "no_order") return translate("summaryGuestBbqNoOrder");
    return translate("summaryGuestBbqAll");
  };

  const sortLabel = (key: GuestListSortKey) => {
    if (key === "reservedAtAsc") return translate("summaryGuestSortDateAsc");
    if (key === "nameAsc") return translate("summaryGuestSortName");
    if (key === "partySizeDesc") return translate("summaryGuestSortPartyDesc");
    if (key === "partySizeAsc") return translate("summaryGuestSortPartyAsc");
    if (key === "statusAsc") return translate("summaryGuestSortStatus");
    return translate("summaryGuestSortDateDesc");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={translate("summaryGuestListTitle")}
      size="xl"
      zIndexClass="z-[80]"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {translate("summaryGuestListHint")} · {periodLabel} · {rows.length}{" "}
          {translate("summaryGuestCount")}
        </p>

        <div className="flex flex-wrap gap-2">
          {(["today", "yesterday", "week", "month", "custom"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setPeriod(option)}
              className={filterButtonClass(period === option)}
            >
              {translate(
                option === "today"
                  ? "summaryToday"
                  : option === "yesterday"
                    ? "summaryYesterday"
                    : option === "week"
                      ? "summaryWeek"
                      : option === "month"
                        ? "summaryMonth"
                        : "summaryPickRange",
              )}
            </button>
          ))}
        </div>
        {period === "custom" ? (
          <DateRangeInputs
            from={customFrom}
            to={customTo}
            onFromChange={setCustomFrom}
            onToChange={setCustomTo}
          />
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
            {translate("summaryGuestFilterBbq")}
            <select
              value={filters.bbq}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  bbq: event.target.value as GuestBbqFilter,
                }))
              }
              className="pos-input mt-1 w-full text-sm"
            >
              {BBQ_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {bbqLabel(option)}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
            {translate("summaryGuestFilterStatus")}
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  status: event.target.value as ReservationStatus | "all",
                }))
              }
              className="pos-input mt-1 w-full text-sm"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status === "all" ? translate("summaryGuestStatusAll") : status}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
            {translate("summaryGuestSort")}
            <select
              value={filters.sort}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  sort: event.target.value as GuestListSortKey,
                }))
              }
              className="pos-input mt-1 w-full text-sm"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {sortLabel(option)}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
            {translate("summaryGuestSearch")}
            <input
              value={filters.search}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, search: event.target.value }))
              }
              className="pos-input mt-1 w-full text-sm"
              placeholder={translate("summaryGuestSearchPlaceholder")}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
            {translate("summaryGuestPartyMin")}
            <input
              type="number"
              min={1}
              value={filters.partySizeMin ?? ""}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  partySizeMin: event.target.value
                    ? Number(event.target.value)
                    : null,
                }))
              }
              className="pos-input mt-1 w-full text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
            {translate("summaryGuestPartyMax")}
            <input
              type="number"
              min={1}
              value={filters.partySizeMax ?? ""}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  partySizeMax: event.target.value
                    ? Number(event.target.value)
                    : null,
                }))
              }
              className="pos-input mt-1 w-full text-sm"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => downloadGuestListExcel(rows, activeRange, language, exportLabels)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
            {translate("summaryGuestExportExcel")}
          </button>
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => downloadGuestListCsv(rows, activeRange, language, exportLabels)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-100"
          >
            <Download className="h-4 w-4" />
            {translate("summaryGuestExportCsv")}
          </button>
        </div>

        {error ? (
          <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
        ) : null}
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {translate("summaryGuestLoading")}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {translate("summaryGuestEmpty")}
          </p>
        ) : (
          <div className="max-h-[55vh] overflow-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2">{translate("summaryGuestName")}</th>
                  <th className="px-3 py-2">{translate("summaryGuestEmail")}</th>
                  <th className="px-3 py-2">{translate("summaryGuestPhone")}</th>
                  <th className="px-3 py-2">{translate("summaryGuestReservedAt")}</th>
                  <th className="px-3 py-2">{translate("summaryGuestPartySize")}</th>
                  <th className="px-3 py-2">{translate("summaryGuestTable")}</th>
                  <th className="px-3 py-2">{translate("summaryGuestStatus")}</th>
                  <th className="px-3 py-2">{translate("summaryGuestBbqOrder")}</th>
                  <th className="px-3 py-2">{translate("summaryGuestSaleTotal")}</th>
                  <th className="px-3 py-2">{translate("summaryGuestOrderSummary")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.reservationId}
                    className="border-t border-gray-100 align-top dark:border-gray-800"
                  >
                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                      {row.guestName}
                    </td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                      {row.guestEmail || "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">
                      {row.guestPhone || "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">
                      {formatReservedShort(row.reservedAt, language)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{row.partySize}</td>
                    <td className="px-3 py-2">{row.tableLabel || "—"}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${bbqBadgeClass(row.bbqOrderStatus)}`}
                      >
                        {bbqLabel(row.bbqOrderStatus)}
                      </span>
                      {row.grillItemNames ? (
                        <p className="mt-1 max-w-[180px] truncate text-[11px] text-gray-500">
                          {row.grillItemNames}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {row.saleTotal == null ? "—" : formatPrice(row.saleTotal)}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
                      <span className="line-clamp-2 max-w-[220px]">
                        {row.orderSummary || "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold dark:border-gray-600"
          >
            {translate("close")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function formatReservedShort(value: Date, language: string): string {
  try {
    return new Intl.DateTimeFormat(
      language === "cs" ? "cs-CZ" : language === "zh" ? "zh-CN" : "en-GB",
      {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      },
    ).format(value);
  } catch {
    return value.toISOString();
  }
}

/** Header action button used on Summary. */
export function SummaryGuestListButton({ onClick }: { onClick: () => void }) {
  const { translate } = useApp();
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
    >
      <Users className="h-3.5 w-3.5" />
      {translate("summaryGuestList")}
    </button>
  );
}
