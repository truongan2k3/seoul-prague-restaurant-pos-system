"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Printer } from "lucide-react";
import { HeaderClockWithStatus } from "@/components/connection-status-badge";
import { DateRangeInputs } from "@/components/date-range-inputs";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import { formatReceiptAmount } from "@/lib/receipt-calculations";
import {
  activeSalesOnly,
  filterSalesInRange,
  formatSummaryDate,
  getPeriodRange,
  toDateInputValue,
  type DateRange,
  type SummaryPeriod,
} from "@/lib/summary-analytics";
import { computeTaxSummaryReport } from "@/lib/tax-summary";
import { printTaxSummaryPdf, printTaxSummaryReport } from "@/src/lib/printTaxSummary";
import { filterButtonClass } from "@/lib/theme-classes";
import type { MenuItem, SaleRecord } from "@/lib/types";

const PERIOD_OPTIONS = ["today", "yesterday", "week", "month", "custom"] as const;

const PERIOD_LABEL_KEYS = {
  today: "summaryToday",
  yesterday: "summaryYesterday",
  week: "summaryWeek",
  month: "summaryMonth",
  custom: "summaryPickRange",
} as const;

export function SummaryView({
  sales,
  menuItems,
  onRefresh,
  onRangeChange,
  loadedRange,
  salesLoading,
  salesError,
}: {
  sales: SaleRecord[];
  menuItems: MenuItem[];
  onRefresh: () => void;
  onRangeChange: (range: DateRange) => void;
  loadedRange: DateRange | null;
  salesLoading: boolean;
  salesError: string | null;
}) {
  const { translate, language } = useApp();
  const { settings } = useSettings();
  const [period, setPeriod] = useState<SummaryPeriod>("today");
  const [customFrom, setCustomFrom] = useState(() => toDateInputValue(new Date()));
  const [customTo, setCustomTo] = useState(() => toDateInputValue(new Date()));
  const [taxPrinting, setTaxPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const activeRange = useMemo(
    () =>
      getPeriodRange(
        period,
        period === "custom" ? { from: customFrom, to: customTo } : undefined,
      ),
    [period, customFrom, customTo],
  );
  useEffect(() => {
    onRangeChange(activeRange);
  }, [onRangeChange, activeRange]);

  const dataReady = !salesLoading && !salesError && loadedRange !== null
    && loadedRange.start <= activeRange.start && loadedRange.end >= activeRange.end;

  const filteredSales = useMemo(
    () => filterSalesInRange(sales, activeRange),
    [sales, activeRange],
  );
  const taxReport = useMemo(
    () =>
      computeTaxSummaryReport({
        sales: activeSalesOnly(filteredSales),
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

  const handlePrintTaxSummary = async (pdf = false) => {
    if (!dataReady || taxReport.documentCount === 0) return;
    setTaxPrinting(true);
    setPrintError(null);
    try {
      if (pdf) await printTaxSummaryPdf(taxReport);
      else await printTaxSummaryReport(taxReport, {
        receiptFontSize: settings.receiptFontSize,
        receiptFontWeight: settings.receiptFontWeight,
        receiptFontFamily: settings.receiptFontFamily,
      });
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : String(err));
    } finally {
      setTaxPrinting(false);
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
    <div className="flex h-full flex-col bg-background text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200/80 bg-background px-2.5 py-1.5 sm:px-4 sm:py-2.5 lg:px-6 lg:py-4 dark:border-gray-800 dark:bg-gray-900">
        <div>
          <h1 className="text-sm font-semibold sm:text-base lg:text-lg text-gray-900 dark:text-gray-100">{translate("summary")}</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{periodLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onRefresh}
            disabled={salesLoading}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300"
          >
            Refresh
          </button>
          <HeaderClockWithStatus />
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

          {!dataReady ? (
            <div role={salesError ? "alert" : "status"} className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-sm">{salesError ? translate("summaryLoadError") : translate("loading")}</p>
              {salesError && <>
                <p className="mt-2 break-words text-xs text-red-500">{salesError}</p>
                <button type="button" onClick={onRefresh} className="mt-3 rounded-lg border px-3 py-2 text-sm">{translate("retry")}</button>
              </>}
            </div>
          ) : <>
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
              <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={taxReport.documentCount === 0 || taxPrinting}
                onClick={() => void handlePrintTaxSummary(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-[#C9A88B]/50 bg-[#C9A88B]/10 px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FileText className="h-4 w-4" />
                {taxPrinting ? "…" : translate("taxSummaryPdf")}
              </button>
              <button
                type="button"
                disabled={taxReport.documentCount === 0 || taxPrinting}
                onClick={() => void handlePrintTaxSummary()}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-100 dark:text-gray-900"
              >
                <Printer className="h-4 w-4" />
                {taxPrinting ? "…" : translate("taxSummaryPrint")}
              </button>
              </div>
            </div>

            {printError && <p role="alert" className="mt-3 text-sm text-red-500">{printError}</p>}

            {taxReport.documentCount === 0 ? (
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
          </>}

        </div>
      </div>
    </div>
  );
}
