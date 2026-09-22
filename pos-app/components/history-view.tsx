"use client";

import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Eye, Pencil, Percent } from "lucide-react";
import { HeaderClockWithStatus } from "@/components/connection-status-badge";
import { DateRangeInputs } from "@/components/date-range-inputs";
import { OrderHistoryModal } from "@/components/order-history-modal";
import { useApp } from "@/contexts/app-context";
import { formatCzk } from "@/lib/currency";
import { saleHasHistoryAlert } from "@/lib/order-activity";
import { generateOrderNumber } from "@/lib/receipt-calculations";
import { shiftIsoDate } from "@/lib/reservation-analytics";
import {
  computeRevenueStats,
  filterHistorySales,
  formatSummaryDate,
  getPeriodRange,
  saleNetTotal,
  toDateInputValue,
  type HistoryPaymentFilter,
  type SummaryPeriod,
} from "@/lib/summary-analytics";
import { formatHistoryDateTime, resolveGuestSeatedAt } from "@/lib/sale-history";
import { filterButtonClass, paymentFilterClass } from "@/lib/theme-classes";
import { POS_EGRESS } from "@/lib/egress-config";
import type { MenuItem, SaleRecord } from "@/lib/types";
import { fetchSales, mapSalesResponse } from "@/src/lib/supabase-data";

interface HistoryViewProps {
  menuItems: MenuItem[];
  onSaleUpdated?: (sale: SaleRecord) => void;
}

const PERIOD_OPTIONS = ["day", "week", "month", "custom"] as const;
type HistoryPeriodOption = (typeof PERIOD_OPTIONS)[number];

const PERIOD_LABEL_KEYS: Record<
  HistoryPeriodOption,
  "resPeriodDay" | "summaryWeek" | "summaryMonth" | "summaryPickRange"
> = {
  day: "resPeriodDay",
  week: "summaryWeek",
  month: "summaryMonth",
  custom: "summaryPickRange",
};

const PAYMENT_OPTIONS: HistoryPaymentFilter[] = ["all", "cash", "card"];

const PAYMENT_LABEL_KEYS: Record<HistoryPaymentFilter, "allPayments" | "cash" | "card"> = {
  all: "allPayments",
  cash: "cash",
  card: "card",
};

const HISTORY_PAGE_SIZE = 50;

function itemCount(sale: SaleRecord): number {
  return sale.items.reduce((sum, item) => sum + item.quantity, 0);
}

function itemPreview(sale: SaleRecord, max = 2): string {
  const names = sale.items.map((item) => `${item.quantity}× ${item.name}`);
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} +${names.length - max}`;
}


export function HistoryView({ menuItems, onSaleUpdated }: HistoryViewProps) {
  const { translate, language, currentStaffUser } = useApp();
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<HistoryPeriodOption>("day");
  const [anchorDate, setAnchorDate] = useState(() => toDateInputValue(new Date()));
  const [customFrom, setCustomFrom] = useState(() => toDateInputValue(new Date()));
  const [customTo, setCustomTo] = useState(() => toDateInputValue(new Date()));
  const [paymentFilter, setPaymentFilter] = useState<HistoryPaymentFilter>("all");
  const [page, setPage] = useState(1);
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);
  const [openEditTip, setOpenEditTip] = useState(false);

  const canEditTip = Boolean(currentStaffUser);

  const rangeOptions = useMemo(() => {
    if (period === "day") return { from: anchorDate, to: anchorDate };
    if (period === "custom") return { from: customFrom, to: customTo };
    return undefined;
  }, [period, anchorDate, customFrom, customTo]);

  const loadSales = useCallback(async () => {
    setLoading(true);
    setError(null);
    const since = new Date();
    since.setDate(since.getDate() - POS_EGRESS.HISTORY_SALES_DAYS);
    since.setHours(0, 0, 0, 0);
    const { data, error: fetchError } = await fetchSales(since);
    if (fetchError) {
      setError(fetchError.message);
      setSales([]);
    } else {
      setSales(mapSalesResponse(data));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  const filteredSales = useMemo(
    () => filterHistorySales(sales, period, paymentFilter, rangeOptions),
    [sales, period, paymentFilter, rangeOptions],
  );

  useEffect(() => {
    setPage(1);
  }, [period, paymentFilter, rangeOptions]);

  const totalPages = Math.max(1, Math.ceil(filteredSales.length / HISTORY_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const pagedSales = useMemo(() => {
    const start = (currentPage - 1) * HISTORY_PAGE_SIZE;
    return filteredSales.slice(start, start + HISTORY_PAGE_SIZE);
  }, [filteredSales, currentPage]);

  const stats = useMemo(() => computeRevenueStats(filteredSales), [filteredSales]);

  const activeRange = useMemo(
    () => getPeriodRange(period, rangeOptions),
    [period, rangeOptions],
  );

  const dateNavLocale = language === "cs" ? "cs-CZ" : language === "zh" ? "zh-CN" : "en-GB";

  const dayLabel = useMemo(() => {
    const date = new Date(`${anchorDate}T12:00:00`);
    return date.toLocaleDateString(dateNavLocale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }, [anchorDate, dateNavLocale]);

  const showDayNav = period === "day";
  const isTodayAnchor = anchorDate === toDateInputValue(new Date());

  const jumpToToday = () => setAnchorDate(toDateInputValue(new Date()));
  const shiftAnchor = (days: number) => {
    setAnchorDate((prev) => shiftIsoDate(prev, days));
  };

  const periodLabel =
    period === "custom" || period === "week" || period === "month"
      ? `${formatSummaryDate(activeRange.start, language)} – ${formatSummaryDate(activeRange.end, language)}`
      : formatSummaryDate(activeRange.start, language);

  const openSale = (sale: SaleRecord, editTip = false) => {
    setSelectedSale(sale);
    setOpenEditTip(editTip);
  };

  const closeModal = () => {
    setSelectedSale(null);
    setOpenEditTip(false);
  };

  return (
    <div className="flex h-full flex-col bg-background text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200/80 bg-background px-2.5 py-1.5 sm:px-4 sm:py-2.5 lg:px-6 lg:py-4 dark:border-gray-800 dark:bg-gray-900">
        <div>
          <h1 className="text-sm font-semibold sm:text-base lg:text-lg text-gray-900 dark:text-gray-100">
            {translate("history")}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{periodLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void loadSales()}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300"
          >
            Refresh
          </button>
          <HeaderClockWithStatus />
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-2.5 dark:border-gray-700 dark:bg-gray-800 sm:p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 sm:text-xs">
                {translate("date")}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {PERIOD_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setPeriod(option);
                      if (option === "day") {
                        setAnchorDate((prev) => prev || toDateInputValue(new Date()));
                      }
                      if (option === "custom") {
                        setCustomFrom(anchorDate);
                        setCustomTo(anchorDate);
                      }
                    }}
                    className={filterButtonClass(period === option)}
                  >
                    {translate(PERIOD_LABEL_KEYS[option])}
                  </button>
                ))}
              </div>

              {showDayNav ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => shiftAnchor(-1)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                    aria-label={translate("resPrevDay")}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <label className="relative inline-flex min-w-[9.5rem] cursor-pointer items-center justify-center">
                    <span className="pointer-events-none rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-center text-xs font-semibold tabular-nums text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 sm:text-sm">
                      {dayLabel}
                    </span>
                    <input
                      type="date"
                      value={anchorDate}
                      onChange={(event) => setAnchorDate(event.target.value)}
                      className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
                      aria-label={translate("resPeriodDay")}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => shiftAnchor(1)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                    aria-label={translate("resNextDay")}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={jumpToToday}
                    disabled={isTodayAnchor}
                    className={filterButtonClass(isTodayAnchor)}
                  >
                    {translate("resTodayJump")}
                  </button>
                </div>
              ) : null}

              {period === "custom" ? (
                <div className="min-w-0 flex-1 sm:max-w-md">
                  <DateRangeInputs
                    from={customFrom}
                    to={customTo}
                    onFromChange={setCustomFrom}
                    onToChange={setCustomTo}
                  />
                </div>
              ) : null}
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <p className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 sm:text-xs">
                {translate("paymentMethod")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {PAYMENT_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPaymentFilter(option)}
                    className={paymentFilterClass(paymentFilter === option, option)}
                  >
                    {translate(PAYMENT_LABEL_KEYS[option])}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {translate("historyPaidBills")}
              </p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{stats.orderCount}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {translate("revenue")}
              </p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{formatCzk(stats.revenue)}</p>
              <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-300">
                <span>
                  {translate("cash")}: {formatCzk(stats.cash)}
                </span>
                <span>
                  {translate("card")}: {formatCzk(stats.card)}
                </span>
                <span>
                  {translate("tipsCash")}: {formatCzk(stats.cashTips)}
                </span>
                <span>
                  {translate("tipsCard")}: {formatCzk(stats.cardTips)}
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  {translate("totalCollected")}: {formatCzk(stats.grandTotal)}
                </span>
              </div>
            </div>
          </section>


          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{translate("loading")}</p>
          ) : error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : filteredSales.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              {sales.length === 0 ? translate("noHistory") : translate("historyNoResults")}
            </p>
          ) : (
            <div className="space-y-3">
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
              <table className="w-full min-w-[1120px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    <th className="px-4 py-3 font-semibold">{translate("table")}</th>
                    <th className="px-4 py-3 font-semibold">{translate("historyItems")}</th>
                    <th className="px-4 py-3 font-semibold">{translate("staff")}</th>
                    <th className="px-4 py-3 font-semibold">{translate("payment")}</th>
                    <th className="px-4 py-3 font-semibold text-right">{translate("totalExclTip")}</th>
                    <th className="px-4 py-3 font-semibold text-right">{translate("tips")}</th>
                    <th className="px-4 py-3 font-semibold text-right">{translate("grandTotal")}</th>
                    <th className="px-4 py-3 font-semibold">{translate("historyGuestArrived")}</th>
                    <th className="px-4 py-3 font-semibold">{translate("historyGuestCheckout")}</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                    <th className="px-4 py-3 font-semibold">{translate("orderId")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedSales.map((sale) => {
                    const orderId = generateOrderNumber(sale.closedAt);
                    const isDeleted = Boolean(sale.deletedAt);
                    const colCount = 11;
                    return (
                      <Fragment key={sale.id}>
                        {isDeleted && (
                          <tr className="bg-red-600 text-white">
                            <td colSpan={colCount} className="px-4 py-2 text-xs font-bold uppercase tracking-wide">
                              − {translate("historyDeletedBanner")} · {translate("table")}{" "}
                              {sale.tableLabel} · {orderId} · −{formatCzk(sale.grandTotal)}
                            </td>
                          </tr>
                        )}
                        <tr
                          className={`border-b border-gray-100 last:border-b-0 dark:border-gray-700/60 ${
                            isDeleted
                              ? "bg-red-50/80 text-red-800 line-through decoration-red-400 dark:bg-red-950/30 dark:text-red-200"
                              : ""
                          }`}
                        >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex w-max shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1 text-base font-bold leading-none text-white dark:bg-gray-100 dark:text-gray-900">
                              {sale.tableLabel}
                            </span>
                            {saleHasHistoryAlert(sale) && (
                              <span
                                title={translate("historyActivityAlert")}
                                className="inline-flex shrink-0 text-amber-500"
                                aria-label={translate("historyActivityAlert")}
                              >
                                <AlertTriangle className="h-5 w-5" strokeWidth={2.5} />
                              </span>
                            )}
                            {sale.discountAmount > 0 && (
                              <span
                                title={translate("historyDiscountAlert")}
                                className="inline-flex shrink-0 text-emerald-600 dark:text-emerald-400"
                                aria-label={translate("historyDiscountAlert")}
                              >
                                <Percent className="h-5 w-5" strokeWidth={2.5} />
                              </span>
                            )}
                          </div>
                          {sale.guestName && (
                            <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                              {sale.guestName}
                              {sale.visitSource === "phone_call"
                                ? " · Phone"
                                : sale.visitSource
                                  ? " · Online"
                                  : ""}
                            </p>
                          )}
                        </td>
                        <td className="max-w-[220px] px-4 py-3">
                          <p className="truncate font-medium text-gray-900 dark:text-gray-100">
                            {itemCount(sale)} {translate("historyItems").toLowerCase()}
                          </p>
                          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                            {itemPreview(sale)}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{sale.staffName}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${
                              sale.paymentMethod === "cash"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                            }`}
                          >
                            {translate(sale.paymentMethod)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums text-gray-700 dark:text-gray-300">
                          {formatCzk(saleNetTotal(sale))}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums text-gray-600 dark:text-gray-400">
                          {sale.tip > 0 ? formatCzk(sale.tip) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold whitespace-nowrap tabular-nums">
                          {isDeleted ? `−${formatCzk(sale.grandTotal)}` : formatCzk(sale.grandTotal)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums text-gray-600 dark:text-gray-300">
                          {formatHistoryDateTime(resolveGuestSeatedAt(sale), language)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums text-gray-600 dark:text-gray-300">
                          {formatHistoryDateTime(sale.closedAt, language)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openSale(sale)}
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              {translate("historyViewBill")}
                            </button>
                            {canEditTip && !isDeleted && (
                              <button
                                type="button"
                                onClick={() => openSale(sale, true)}
                                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                {translate("editTipAndPayment")}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs whitespace-nowrap tabular-nums text-gray-500 dark:text-gray-400">
                          {orderId}
                        </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredSales.length > HISTORY_PAGE_SIZE ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {translate("historyPageOf")
                    .replace("{page}", String(currentPage))
                    .replace("{total}", String(totalPages))}
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                    ({translate("historyPageShowing")
                      .replace("{from}", String((currentPage - 1) * HISTORY_PAGE_SIZE + 1))
                      .replace(
                        "{to}",
                        String(Math.min(currentPage * HISTORY_PAGE_SIZE, filteredSales.length)),
                      )
                      .replace("{count}", String(filteredSales.length))}
                    )
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((prev) => Math.max(1, Math.min(prev, totalPages) - 1))}
                    disabled={currentPage <= 1}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 enabled:hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-200 dark:enabled:hover:bg-gray-700"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {translate("historyPrevPage")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((prev) => Math.min(totalPages, Math.min(prev, totalPages) + 1))}
                    disabled={currentPage >= totalPages}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 enabled:hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-200 dark:enabled:hover:bg-gray-700"
                  >
                    {translate("historyNextPage")}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : null}
            </div>
          )}
        </div>
      </div>

      {selectedSale && (
        <OrderHistoryModal
          sale={selectedSale}
          menuItems={menuItems}
          initialEditTip={openEditTip}
          onClose={closeModal}
          onUpdated={(updated) => {
            setSales((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
            onSaleUpdated?.(updated);
          }}
          onDeleted={(deletedId, deletedAt) => {
            setSales((prev) =>
              prev.map((row) =>
                row.id === deletedId ? { ...row, deletedAt: deletedAt ?? new Date() } : row,
              ),
            );
            closeModal();
          }}
        />
      )}
    </div>
  );
}
