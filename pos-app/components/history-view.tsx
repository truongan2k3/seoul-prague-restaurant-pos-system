"use client";

import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { AlertTriangle, Eye, Pencil, Trash2 } from "lucide-react";
import { LiveClock } from "@/components/live-clock";
import { DateRangeInputs } from "@/components/date-range-inputs";
import { OrderHistoryModal } from "@/components/order-history-modal";
import { usePinGate } from "@/contexts/pin-gate-context";
import { useApp } from "@/contexts/app-context";
import { useNotifications } from "@/contexts/notification-context";
import { formatCzk } from "@/lib/currency";
import { saleHasCancelActivity } from "@/lib/order-activity";
import { generateOrderNumber } from "@/lib/receipt-calculations";
import { canManageStaff } from "@/lib/staff-roles";
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
import {
  deleteSaleRecords,
  deleteSalesByDate,
  deleteSalesByMonth,
} from "@/src/lib/sales-actions";
import { fetchSales, mapSalesResponse } from "@/src/lib/supabase-data";

interface HistoryViewProps {
  menuItems: MenuItem[];
  onSaleUpdated?: (sale: SaleRecord) => void;
}

const PERIOD_OPTIONS: SummaryPeriod[] = ["today", "yesterday", "week", "month", "custom"];

const PERIOD_LABEL_KEYS = {
  today: "summaryToday",
  yesterday: "summaryYesterday",
  week: "summaryWeek",
  month: "summaryMonth",
  custom: "summaryPickRange",
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

function toMonthInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function HistoryView({ menuItems, onSaleUpdated }: HistoryViewProps) {
  const { translate, language, currentStaffUser, logAction } = useApp();
  const { pushNotification } = useNotifications();
  const { requestPin } = usePinGate();
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<SummaryPeriod>("today");
  const [customFrom, setCustomFrom] = useState(() => toDateInputValue(new Date()));
  const [customTo, setCustomTo] = useState(() => toDateInputValue(new Date()));
  const [paymentFilter, setPaymentFilter] = useState<HistoryPaymentFilter>("all");
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);
  const [openEditScope, setOpenEditScope] = useState<"payment" | "full" | false>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteDate, setDeleteDate] = useState(() => toDateInputValue(new Date()));
  const [deleteMonth, setDeleteMonth] = useState(() => toMonthInputValue());
  const [deleting, setDeleting] = useState(false);

  const canEdit = canManageStaff(currentStaffUser?.role);

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
    () =>
      filterHistorySales(
        sales,
        period,
        paymentFilter,
        period === "custom" ? { from: customFrom, to: customTo } : undefined,
      ),
    [sales, period, paymentFilter, customFrom, customTo],
  );

  const filteredIds = useMemo(() => new Set(filteredSales.map((sale) => sale.id)), [filteredSales]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => filteredIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredIds]);

  const stats = useMemo(() => computeRevenueStats(filteredSales), [filteredSales]);

  const activeRange = useMemo(
    () =>
      getPeriodRange(
        period,
        period === "custom" ? { from: customFrom, to: customTo } : undefined,
      ),
    [period, customFrom, customTo],
  );

  const periodLabel =
    period === "custom"
      ? `${formatSummaryDate(activeRange.start, language)} – ${formatSummaryDate(activeRange.end, language)}`
      : `${formatSummaryDate(activeRange.start, language)}${
          period === "week" || period === "month"
            ? ` – ${formatSummaryDate(activeRange.end, language)}`
            : ""
        }`;

  const allFilteredSelected =
    filteredSales.filter((sale) => !sale.deletedAt).length > 0 &&
    filteredSales.filter((sale) => !sale.deletedAt).every((sale) => selectedIds.has(sale.id));

  const toggleSelectAll = () => {
    const activeIds = filteredSales.filter((sale) => !sale.deletedAt).map((sale) => sale.id);
    if (allFilteredSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(activeIds));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteResult = (
    deletedRows: { id: string; deleted_at?: string | null }[] | undefined,
    detail: string,
  ) => {
    if (!deletedRows || deletedRows.length === 0) {
      pushNotification({ message: translate("historyDeleteFailed") });
      return;
    }
    const deletedAtById = new Map(
      deletedRows.map((row) => [
        row.id,
        row.deleted_at ? new Date(row.deleted_at) : new Date(),
      ]),
    );
    setSales((prev) =>
      prev.map((sale) => {
        const deletedAt = deletedAtById.get(sale.id);
        return deletedAt ? { ...sale, deletedAt } : sale;
      }),
    );
    setSelectedIds((prev) => {
      const next = new Set(prev);
      deletedRows.forEach((row) => next.delete(row.id));
      return next;
    });
    if (selectedSale && deletedAtById.has(selectedSale.id)) {
      setSelectedSale(null);
      setOpenEditScope(false);
    }
    logAction("delete_sale", detail);
    pushNotification({ message: translate("historyDeleteSuccess") });
  };

  const runDelete = async (
    action: () => Promise<{
      data: { id: string; deleted_at?: string | null }[] | null;
      error: { message: string } | null;
    }>,
    detail: string,
  ) => {
    if (deleting) return;
    setDeleting(true);
    const { data, error: deleteError } = await action();
    setDeleting(false);
    if (deleteError) {
      pushNotification({ message: translate("historyDeleteFailed") });
      return;
    }
    handleDeleteResult(data ?? undefined, detail);
  };

  const confirmDeleteSelected = () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    requestPin(
      () => runDelete(() => deleteSaleRecords(ids), `Deleted ${ids.length} sale(s)`),
      { force: true },
    );
  };

  const confirmDeleteByDate = () => {
    requestPin(
      () => runDelete(() => deleteSalesByDate(deleteDate), `Deleted sales on ${deleteDate}`),
      { force: true },
    );
  };

  const confirmDeleteMonth = () => {
    requestPin(
      () => runDelete(() => deleteSalesByMonth(deleteMonth), `Deleted sales for ${deleteMonth}`),
      { force: true },
    );
  };

  const confirmDeleteOne = (sale: SaleRecord) => {
    requestPin(
      () =>
        runDelete(
          () => deleteSaleRecords([sale.id]),
          `Deleted sale ${generateOrderNumber(sale.closedAt)} (${sale.tableLabel})`,
        ),
      { force: true },
    );
  };

  const openSale = (sale: SaleRecord, editScope: "payment" | "full" | false = false) => {
    setSelectedSale(sale);
    setOpenEditScope(editScope);
  };

  const closeModal = () => {
    setSelectedSale(null);
    setOpenEditScope(false);
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
              <DateRangeInputs
                from={customFrom}
                to={customTo}
                onFromChange={setCustomFrom}
                onToChange={setCustomTo}
              />
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

          {canEdit && filteredSales.length > 0 && (
            <section className="rounded-xl border border-red-200 bg-red-50/50 p-4 dark:border-red-900/50 dark:bg-red-950/20">
              <div className="flex flex-wrap items-end gap-3">
                <button
                  type="button"
                  disabled={selectedIds.size === 0 || deleting}
                  onClick={confirmDeleteSelected}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  {translate("deleteSelected")}
                  {selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
                </button>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                    {translate("deleteByDate")}
                    <input
                      type="date"
                      value={deleteDate}
                      onChange={(event) => setDeleteDate(event.target.value)}
                      className="pos-input mt-1 block min-w-[10rem]"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={confirmDeleteByDate}
                    className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-gray-900 dark:text-red-300 dark:hover:bg-red-950/40"
                  >
                    {translate("confirmDelete")}
                  </button>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                    {translate("deleteEntireMonth")}
                    <input
                      type="month"
                      value={deleteMonth}
                      onChange={(event) => setDeleteMonth(event.target.value)}
                      className="pos-input mt-1 block min-w-[10rem]"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={confirmDeleteMonth}
                    className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-gray-900 dark:text-red-300 dark:hover:bg-red-950/40"
                  >
                    {translate("confirmDelete")}
                  </button>
                </div>
              </div>
            </section>
          )}

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
              <table className="w-full min-w-[1120px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    {canEdit && (
                      <th className="px-4 py-3 font-semibold">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={toggleSelectAll}
                          aria-label={translate("selectAll")}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                      </th>
                    )}
                    <th className="px-4 py-3 font-semibold">{translate("table")}</th>
                    <th className="px-4 py-3 font-semibold">{translate("orderId")}</th>
                    <th className="px-4 py-3 font-semibold">{translate("historyItems")}</th>
                    <th className="px-4 py-3 font-semibold">{translate("staff")}</th>
                    <th className="px-4 py-3 font-semibold">{translate("payment")}</th>
                    <th className="px-4 py-3 font-semibold text-right">{translate("totalExclTip")}</th>
                    <th className="px-4 py-3 font-semibold text-right">{translate("tips")}</th>
                    <th className="px-4 py-3 font-semibold text-right">{translate("grandTotal")}</th>
                    <th className="px-4 py-3 font-semibold">{translate("historyGuestArrived")}</th>
                    <th className="px-4 py-3 font-semibold">{translate("historyGuestCheckout")}</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.map((sale) => {
                    const orderId = generateOrderNumber(sale.closedAt);
                    const isDeleted = Boolean(sale.deletedAt);
                    const colCount = canEdit ? 12 : 11;
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
                        {canEdit && (
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(sale.id)}
                              disabled={isDeleted}
                              onChange={() => toggleSelect(sale.id)}
                              aria-label={`${translate("selectAll")} ${orderId}`}
                              className="h-4 w-4 rounded border-gray-300 disabled:opacity-40"
                            />
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex min-w-[3rem] max-w-[8rem] shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1 text-base font-bold text-white dark:bg-gray-100 dark:text-gray-900">
                              {sale.tableLabel}
                            </span>
                            {saleHasCancelActivity(sale) && (
                              <span
                                title={translate("historyCancelAlert")}
                                className="inline-flex shrink-0 text-amber-500"
                                aria-label={translate("historyCancelAlert")}
                              >
                                <AlertTriangle className="h-5 w-5" strokeWidth={2.5} />
                              </span>
                            )}
                          </div>
                          {sale.guestName && (
                            <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                              {sale.guestName}
                              {sale.visitSource === "walk_in" ? " · Walk-in" : sale.visitSource === "reservation" ? " · Booking" : ""}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs whitespace-nowrap tabular-nums text-gray-700 dark:text-gray-300">
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
                            {canEdit && !isDeleted && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openSale(sale, "payment")}
                                  className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  {translate("editTipAndPayment")}
                                </button>
                                <button
                                  type="button"
                                  disabled={deleting}
                                  onClick={() => confirmDeleteOne(sale)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  {translate("deleteOrder")}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                        </tr>
                      </Fragment>
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
          initialEditScope={openEditScope}
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
            setSelectedIds((prev) => {
              const next = new Set(prev);
              next.delete(deletedId);
              return next;
            });
            closeModal();
          }}
        />
      )}
    </div>
  );
}
