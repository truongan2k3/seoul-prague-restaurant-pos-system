"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { LiveClock } from "@/components/live-clock";
import { OrderHistoryModal } from "@/components/order-history-modal";
import { useApp } from "@/contexts/app-context";
import { formatCzk } from "@/lib/currency";
import { generateOrderNumber } from "@/lib/receipt-calculations";
import { canManageStaff } from "@/lib/staff-roles";
import {
  computeRevenueStats,
  filterHistorySales,
  formatSummaryDate,
  getPeriodRange,
  toDateInputValue,
  type HistoryPaymentFilter,
  type SummaryPeriod,
} from "@/lib/summary-analytics";
import { filterButtonClass, paymentFilterClass } from "@/lib/theme-classes";
import type { MenuItem, SaleRecord } from "@/lib/types";
import { fetchSales, mapSalesResponse } from "@/src/lib/supabase-data";

interface HistoryViewProps {
  menuItems: MenuItem[];
}

const PERIOD_OPTIONS: SummaryPeriod[] = ["today", "yesterday", "week", "month", "custom"];

const PERIOD_LABEL_KEYS = {
  today: "summaryToday",
  yesterday: "summaryYesterday",
  week: "summaryWeek",
  month: "summaryMonth",
  custom: "summaryPickDate",
} as const;

const PAYMENT_OPTIONS: HistoryPaymentFilter[] = ["all", "cash", "card"];

const PAYMENT_LABEL_KEYS: Record<HistoryPaymentFilter, "allPayments" | "cash" | "card"> = {
  all: "allPayments",
  cash: "cash",
  card: "card",
};

function itemCount(sale: SaleRecord): number {
  return sale.items.reduce((sum, item) => sum + item.quantity, 0);
}

function itemPreview(sale: SaleRecord, max = 2): string {
  const names = sale.items.map((item) => `${item.quantity}× ${item.name}`);
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} +${names.length - max}`;
}

export function HistoryView({ menuItems }: HistoryViewProps) {
  const { translate, language, currentStaffUser } = useApp();
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<SummaryPeriod>("today");
  const [customDate, setCustomDate] = useState(() => toDateInputValue(new Date()));
  const [paymentFilter, setPaymentFilter] = useState<HistoryPaymentFilter>("all");
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);
  const [openInEditMode, setOpenInEditMode] = useState(false);

  const canEdit = canManageStaff(currentStaffUser?.role);

  const loadSales = useCallback(async () => {
    setLoading(true);
    setError(null);
    const since = new Date();
    since.setDate(since.getDate() - 90);
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
    () => filterHistorySales(sales, period, paymentFilter, period === "custom" ? customDate : undefined),
    [sales, period, paymentFilter, customDate],
  );

  const stats = useMemo(() => computeRevenueStats(filteredSales), [filteredSales]);

  const activeRange = useMemo(
    () => getPeriodRange(period, period === "custom" ? customDate : undefined),
    [period, customDate],
  );

  const periodLabel =
    period === "custom"
      ? formatSummaryDate(new Date(`${customDate}T12:00:00`), language)
      : `${formatSummaryDate(activeRange.start, language)}${
          period === "week" || period === "month"
            ? ` – ${formatSummaryDate(activeRange.end, language)}`
            : ""
        }`;

  const openSale = (sale: SaleRecord, edit = false) => {
    setSelectedSale(sale);
    setOpenInEditMode(edit);
  };

  const closeModal = () => {
    setSelectedSale(null);
    setOpenInEditMode(false);
  };

  return (
    <div className="flex h-full flex-col bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
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
          <LiveClock />
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {translate("date")}
            </p>
            <div className="flex flex-wrap gap-2">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setPeriod(option)}
                  className={filterButtonClass(period === option)}
                >
                  {translate(PERIOD_LABEL_KEYS[option])}
                </button>
              ))}
            </div>
            {period === "custom" && (
              <div className="mt-3">
                <input
                  type="date"
                  value={customDate}
                  onChange={(event) => setCustomDate(event.target.value)}
                  className="pos-input max-w-xs"
                />
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {translate("paymentMethod")}
            </p>
            <div className="flex flex-wrap gap-2">
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
              <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{formatCzk(stats.grandTotal)}</p>
              <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-300">
                <span>
                  {translate("cash")}: {formatCzk(stats.cash)}
                </span>
                <span>
                  {translate("card")}: {formatCzk(stats.card)}
                </span>
                <span>
                  {translate("tips")}: {formatCzk(stats.tips)}
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
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    <th className="px-4 py-3 font-semibold">{translate("table")}</th>
                    <th className="px-4 py-3 font-semibold">{translate("orderId")}</th>
                    <th className="px-4 py-3 font-semibold">{translate("historyItems")}</th>
                    <th className="px-4 py-3 font-semibold">{translate("staff")}</th>
                    <th className="px-4 py-3 font-semibold">{translate("payment")}</th>
                    <th className="px-4 py-3 font-semibold text-right">{translate("grandTotal")}</th>
                    <th className="px-4 py-3 font-semibold">{translate("date")}</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.map((sale) => {
                    const orderId = generateOrderNumber(sale.closedAt);
                    return (
                      <tr
                        key={sale.id}
                        className="border-b border-gray-100 last:border-b-0 dark:border-gray-700/60"
                      >
                        <td className="px-4 py-3">
                          <span className="inline-flex min-w-[3rem] items-center justify-center rounded-lg bg-gray-900 px-2.5 py-1 text-base font-bold text-white dark:bg-gray-100 dark:text-gray-900">
                            {sale.tableLabel}
                          </span>
                          {sale.guestName && (
                            <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                              {sale.guestName}
                              {sale.visitSource === "walk_in" ? " · Walk-in" : sale.visitSource === "reservation" ? " · Booking" : ""}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs tabular-nums text-gray-700 dark:text-gray-300">
                          {orderId}
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
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${
                              sale.paymentMethod === "cash"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                            }`}
                          >
                            {translate(sale.paymentMethod)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">
                          {formatCzk(sale.grandTotal)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-gray-600 dark:text-gray-300">
                          {sale.closedAt.toLocaleString(
                            language === "cs" ? "cs-CZ" : language === "zh" ? "zh-CN" : "en-GB",
                            { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" },
                          )}
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
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => openSale(sale, true)}
                                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                {translate("editOrder")}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selectedSale && (
        <OrderHistoryModal
          sale={selectedSale}
          menuItems={menuItems}
          initialEditMode={openInEditMode}
          onClose={closeModal}
          onUpdated={(updated) => {
            setSales((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
            setSelectedSale(updated);
          }}
        />
      )}
    </div>
  );
}
