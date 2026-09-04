"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Download, Minus, Printer } from "lucide-react";
import { LiveClock } from "@/components/live-clock";
import { DateRangeInputs } from "@/components/date-range-inputs";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import { formatPrice } from "@/lib/i18n/translations";
import { formatReceiptAmount } from "@/lib/receipt-calculations";
import {
  computeRevenueChange,
  computeRevenueStats,
  computeTopSellers,
  filterSalesInRange,
  formatSummaryDate,
  getPeriodRange,
  toDateInputValue,
  type CategoryTopSellers,
  type SummaryPeriod,
  type TopSellerGroup,
  type TopSellerRow,
} from "@/lib/summary-analytics";
import { downloadSummaryItemsExcel } from "@/lib/summary-excel-export";
import { computeSummaryItemStats } from "@/lib/summary-item-stats";
import { computeTaxSummaryReport } from "@/lib/tax-summary";
import { printTaxSummaryReport } from "@/src/lib/printTaxSummary";
import { filterButtonClass, segmentButtonClass } from "@/lib/theme-classes";
import type { MenuItem, SaleRecord } from "@/lib/types";

const PERIOD_OPTIONS: SummaryPeriod[] = ["today", "yesterday", "week", "month", "custom"];

const PERIOD_LABEL_KEYS = {
  today: "summaryToday",
  yesterday: "summaryYesterday",
  week: "summaryWeek",
  month: "summaryMonth",
  custom: "summaryPickRange",
} as const;

const GROUP_OPTIONS: TopSellerGroup[] = ["all", "food", "drink", "category"];

const GROUP_LABEL_KEYS = {
  all: "summaryAllItems",
  food: "summaryFood",
  drink: "summaryDrinks",
  category: "summaryByCategory",
} as const;

function ChangeBadge({ change }: { change: number | null }) {
  if (change === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        <Minus className="h-3.5 w-3.5" />
        new
      </span>
    );
  }

  const positive = change >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
        positive
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {positive ? "+" : ""}
      {change.toFixed(1)}%
    </span>
  );
}

function TopSellerList({ rows }: { rows: TopSellerRow[] }) {
  const { translate } = useApp();

  if (rows.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">{translate("summaryNoSales")}</p>;
  }

  return (
    <ul className="space-y-2">
      {rows.map((row, index) => (
        <li
          key={row.key}
          className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900/50"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{row.name}</p>
              <p className="truncate text-xs text-gray-500 dark:text-gray-400">{row.category}</p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">{row.quantity}x</p>
            <p className="text-xs tabular-nums text-gray-500 dark:text-gray-400">{formatPrice(row.revenue)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function CategoryTopSellerSections({ sections }: { sections: CategoryTopSellers[] }) {
  const { translate } = useApp();

  if (sections.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">{translate("summaryNoSales")}</p>;
  }

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <div key={section.category}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{section.category}</h3>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {section.totalQuantity}x
            </span>
          </div>
          <TopSellerList rows={section.items} />
        </div>
      ))}
    </div>
  );
}

export function SummaryView({
  sales,
  menuItems,
  onRefresh,
}: {
  sales: SaleRecord[];
  menuItems: MenuItem[];
  onRefresh: () => void;
}) {
  const { translate, language } = useApp();
  const { settings } = useSettings();
  const [period, setPeriod] = useState<SummaryPeriod>("today");
  const [customFrom, setCustomFrom] = useState(() => toDateInputValue(new Date()));
  const [customTo, setCustomTo] = useState(() => toDateInputValue(new Date()));
  const [sellerGroup, setSellerGroup] = useState<TopSellerGroup>("all");
  const [taxPrinting, setTaxPrinting] = useState(false);
  const [excelExporting, setExcelExporting] = useState(false);

  const todayRange = useMemo(() => getPeriodRange("today"), []);
  const yesterdayRange = useMemo(() => getPeriodRange("yesterday"), []);
  const activeRange = useMemo(
    () =>
      getPeriodRange(
        period,
        period === "custom" ? { from: customFrom, to: customTo } : undefined,
      ),
    [period, customFrom, customTo],
  );

  const filteredSales = useMemo(
    () => filterSalesInRange(sales, activeRange),
    [sales, activeRange],
  );
  const todaySales = useMemo(() => filterSalesInRange(sales, todayRange), [sales, todayRange]);
  const yesterdaySales = useMemo(
    () => filterSalesInRange(sales, yesterdayRange),
    [sales, yesterdayRange],
  );

  const stats = useMemo(() => computeRevenueStats(filteredSales), [filteredSales]);
  const todayStats = useMemo(() => computeRevenueStats(todaySales), [todaySales]);
  const yesterdayStats = useMemo(() => computeRevenueStats(yesterdaySales), [yesterdaySales]);
  const changeVsYesterday = useMemo(
    () => computeRevenueChange(todayStats.revenue, yesterdayStats.revenue),
    [todayStats.revenue, yesterdayStats.revenue],
  );

  const topSellers = useMemo(
    () => computeTopSellers(filteredSales, menuItems, language, sellerGroup),
    [filteredSales, menuItems, language, sellerGroup],
  );

  const taxReport = useMemo(
    () =>
      computeTaxSummaryReport({
        sales: filteredSales,
        menuItems,
        range: activeRange,
        business: {
          brandName: settings.receiptHeaderTitle,
          brandAddress: settings.receiptAddress,
          legalName: settings.receiptLegalName,
          companyAddress: settings.receiptCompanyAddress,
          ico: settings.receiptIco,
          dic: settings.receiptDic,
          phone: settings.receiptPhone,
        },
      }),
    [filteredSales, menuItems, activeRange, settings],
  );

  const itemStatsReport = useMemo(
    () => computeSummaryItemStats(filteredSales, menuItems, language),
    [filteredSales, menuItems, language],
  );

  const handlePrintTaxSummary = async () => {
    setTaxPrinting(true);
    try {
      await printTaxSummaryReport(taxReport, {
        receiptFontSize: settings.receiptFontSize,
        receiptFontWeight: settings.receiptFontWeight,
        receiptFontFamily: settings.receiptFontFamily,
      });
    } finally {
      setTaxPrinting(false);
    }
  };

  const handleDownloadExcel = () => {
    if (itemStatsReport.rows.length === 0) return;
    setExcelExporting(true);
    try {
      downloadSummaryItemsExcel(itemStatsReport, activeRange, language, {
        itemsSheet: translate("summaryExcelItemsSheet"),
        taxSheet: translate("summaryExcelTaxSheet"),
        itemName: translate("summaryExcelItemName"),
        quantity: translate("summaryExcelQuantity"),
        originalTotal: translate("summaryExcelOriginalTotal"),
        taxRate: translate("taxSummaryRate"),
        taxBase: translate("taxSummaryBase"),
        taxVat: translate("taxSummaryVat"),
        taxGross: translate("taxSummaryGross"),
        category: translate("summaryExcelCategory"),
        itemType: translate("summaryExcelItemType"),
        period: translate("summaryExcelPeriod"),
        note: translate("summaryExcelNote"),
        soldSection: translate("summaryExcelSoldSection"),
        cancelledSection: translate("summaryExcelCancelledSection"),
        typeTotalsSection: translate("summaryExcelTypeTotals"),
        categoryTotalsSection: translate("summaryExcelCategoryTotals"),
        overviewSection: translate("summaryExcelOverview"),
        soldTotal: translate("summaryExcelSoldTotal"),
        cancelledTotal: translate("summaryExcelCancelledTotal"),
        food: translate("summaryExcelFood"),
        drinks: translate("summaryExcelDrinks"),
        emptyCancelled: translate("summaryExcelEmptyCancelled"),
        emptySold: translate("summaryExcelEmptySold"),
        subtotal: translate("summaryExcelSubtotal"),
      });
    } finally {
      setExcelExporting(false);
    }
  };

  const periodLabel =
    period === "custom"
      ? `${formatSummaryDate(activeRange.start, language)} – ${formatSummaryDate(activeRange.end, language)}`
      : `${formatSummaryDate(activeRange.start, language)}${
          period === "week" || period === "month"
            ? ` – ${formatSummaryDate(activeRange.end, language)}`
            : ""
        }`;

  return (
    <div className="flex h-full flex-col bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{translate("summary")}</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{periodLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onRefresh}
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

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {period === "today" ? translate("summaryToday") : translate("summaryPeriodRevenue")}
                  </h2>
                  <p className="mt-2 text-4xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                    {formatPrice(period === "today" ? todayStats.revenue : stats.revenue)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {translate("revenueExclTipHint")}
                  </p>
                </div>
                {period === "today" && <ChangeBadge change={changeVsYesterday} />}
              </div>

              {period === "today" && (
                <div className="mt-4 rounded-lg border border-dashed border-gray-200 px-4 py-3 dark:border-gray-700">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {translate("summaryYesterday")}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-gray-800 dark:text-gray-200">
                    {formatPrice(yesterdayStats.revenue)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {translate("summaryComparedToYesterday")}
                  </p>
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50">
                  <p className="text-gray-500 dark:text-gray-400">{translate("summaryOrders")}</p>
                  <p className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                    {stats.orderCount}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50">
                  <p className="text-gray-500 dark:text-gray-400">{translate("cash")}</p>
                  <p className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                    {formatPrice(stats.cash)}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50">
                  <p className="text-gray-500 dark:text-gray-400">{translate("card")}</p>
                  <p className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                    {formatPrice(stats.card)}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50">
                  <p className="text-gray-500 dark:text-gray-400">{translate("tips")}</p>
                  <p className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                    {formatPrice(stats.tips)}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50">
                  <p className="text-gray-500 dark:text-gray-400">{translate("totalCollected")}</p>
                  <p className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                    {formatPrice(stats.grandTotal)}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {translate("topItems")}
                  </h2>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {translate("summaryExcelHint")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={itemStatsReport.rows.length === 0 || excelExporting}
                    onClick={handleDownloadExcel}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  >
                    <Download className="h-4 w-4" />
                    {excelExporting ? "…" : translate("summaryExcelDownload")}
                  </button>
                  <div className="pos-segment">
                    {GROUP_OPTIONS.map((group) => (
                      <button
                        key={group}
                        type="button"
                        onClick={() => setSellerGroup(group)}
                        className={segmentButtonClass(sellerGroup === group)}
                      >
                        {translate(GROUP_LABEL_KEYS[group])}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 max-h-[420px] overflow-y-auto">
                {sellerGroup === "category" ? (
                  <CategoryTopSellerSections sections={topSellers as CategoryTopSellers[]} />
                ) : (
                  <TopSellerList rows={topSellers as TopSellerRow[]} />
                )}
              </div>
            </section>
          </div>

          <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {translate("taxSummaryTitle")}
                </h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {translate("taxSummaryHint")}
                </p>
              </div>
              <button
                type="button"
                disabled={filteredSales.length === 0 || taxPrinting}
                onClick={() => void handlePrintTaxSummary()}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-100 dark:text-gray-900"
              >
                <Printer className="h-4 w-4" />
                {taxPrinting ? "…" : translate("taxSummaryPrint")}
              </button>
            </div>

            {filteredSales.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                {translate("summaryNoSales")}
              </p>
            ) : (
              <div className="mt-4 space-y-6">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {translate("taxSummaryDocuments")}: {taxReport.documentCount}
                </p>
                {taxReport.sections.map((section) => (
                  <div key={section.title ?? "total"}>
                    {section.title ? (
                      <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {section.title === "Jidelna"
                          ? translate("taxSummaryDineIn")
                          : section.title === "S SEBOU"
                            ? translate("taxSummaryTakeaway")
                            : section.title}
                      </h3>
                    ) : null}
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[420px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                            <th className="py-2 pr-3">{translate("taxSummaryRate")}</th>
                            <th className="py-2 pr-3 text-right">{translate("taxSummaryBase")}</th>
                            <th className="py-2 pr-3 text-right">{translate("taxSummaryVat")}</th>
                            <th className="py-2 text-right">{translate("taxSummaryGross")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.rows.map((row) => (
                            <tr
                              key={`${section.title ?? "all"}-${row.label}`}
                              className={`border-b border-gray-100 dark:border-gray-800/60 ${
                                row.label === "Celkem" ? "font-semibold" : ""
                              }`}
                            >
                              <td className="py-2 pr-3">{row.label}</td>
                              <td className="py-2 pr-3 text-right tabular-nums">
                                {formatReceiptAmount(row.base)}
                              </td>
                              <td className="py-2 pr-3 text-right tabular-nums">
                                {formatReceiptAmount(row.vat)}
                              </td>
                              <td className="py-2 text-right tabular-nums">
                                {formatReceiptAmount(row.gross)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
