"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ArrowLeft, ArrowRight, Printer } from "lucide-react";
import { CardPaymentModal } from "@/components/card-payment-modal";
import { NumericInputField } from "@/components/numeric-input-field";
import { PercentPresetButtons } from "@/components/percent-preset-buttons";
import { useApp } from "@/contexts/app-context";
import { usePinGate } from "@/contexts/pin-gate-context";
import { useSettings } from "@/contexts/settings-context";
import {
  buildCheckoutTotals,
  calcTipFromPercent,
  lineTotal,
  ordersFromLines,
  remainingLines,
  type CheckoutLine,
  type CheckoutSubmitPayload,
  type DiscountType,
  type SplitMode,
} from "@/lib/checkout-calculations";
import { formatPosPrice, priceDisplayOptionsFromSettings } from "@/lib/price-display";
import { buildReceiptLines } from "@/lib/receipt-calculations";
import { buildCfdCheckoutPayload, sendCfdEvent, type CfdCheckoutPayload } from "@/lib/cfd-display";
import { playPaymentSuccessSound } from "@/lib/notification-sound";
import type { MenuItem, OrderItem, PaymentMethod } from "@/lib/types";
import type { TerminalPaymentResponse } from "@/src/lib/terminalApi";
import { filterButtonClass, paymentFilterClass } from "@/lib/theme-classes";

type AccordionPanel = "split" | "discount" | "tip";

interface CheckoutPanelProps {
  lines: CheckoutLine[];
  orderSummary: OrderItem[];
  menuItems: MenuItem[];
  tableLabel?: string;
  isSaving?: boolean;
  onCheckout: (payload: CheckoutSubmitPayload) => void | Promise<void>;
  onCfdUpdate?: (payload: CfdCheckoutPayload) => void;
  confirmLabel?: string;
}

function AccordionTabBar({
  active,
  onChange,
  tabs,
}: {
  active: AccordionPanel | null;
  onChange: (panel: AccordionPanel) => void;
  tabs: { id: AccordionPanel; label: string }[];
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-gray-700 dark:bg-gray-900">
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`min-h-[40px] flex-1 rounded-lg px-2 py-2 text-center text-xs font-semibold transition-colors sm:text-sm ${
              isActive
                ? "bg-white text-blue-900 shadow-sm dark:bg-gray-800 dark:text-blue-100"
                : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function CollapseSection({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
    >
      <div className="overflow-hidden">
        <div className="pt-2">{children}</div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  emphasize,
  highlight,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 ${
        emphasize ? "text-sm font-bold" : "text-xs"
      } ${highlight ? "text-emerald-700 dark:text-emerald-400" : ""}`}
    >
      <span className={emphasize ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"}>
        {label}
      </span>
      <span
        className={`shrink-0 tabular-nums ${emphasize ? "text-base text-gray-900 dark:text-gray-100" : "font-medium text-gray-800 dark:text-gray-200"}`}
      >
        {value}
      </span>
    </div>
  );
}

export function CheckoutPanel({
  lines,
  orderSummary,
  menuItems,
  tableLabel,
  isSaving = false,
  onCheckout,
  onCfdUpdate,
  confirmLabel,
}: CheckoutPanelProps) {
  const { translate } = useApp();
  const { settings } = useSettings();
  const { requestPin } = usePinGate();
  const priceOptions = useMemo(
    () => priceDisplayOptionsFromSettings(settings),
    [settings],
  );
  const displayPrice = useCallback(
    (amount: number) => formatPosPrice(amount, priceOptions),
    [priceOptions],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDivElement | null>(null);

  const [accordion, setAccordion] = useState<AccordionPanel | null>(null);
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountValue, setDiscountValue] = useState(0);
  const [discountPreset, setDiscountPreset] = useState<number | null>(null);
  const [tipMode, setTipMode] = useState<"preset" | "custom">("custom");
  const [tipPreset, setTipPreset] = useState<number | null>(null);
  const [customTip, setCustomTip] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  /** Amount the guest actually tenders / is charged — excess over bill auto-becomes tip. */
  const [customerPays, setCustomerPays] = useState("");
  const [splitMode, setSplitMode] = useState<SplitMode>("total");
  const [splitCount, setSplitCount] = useState(2);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [cardTerminalOpen, setCardTerminalOpen] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState<CheckoutSubmitPayload | null>(null);
  const [terminalBusy, setTerminalBusy] = useState(false);

  const menuById = useMemo(() => new Map(menuItems.map((item) => [item.id, item])), [menuItems]);

  const summaryRows = useMemo(
    () => buildReceiptLines(orderSummary, menuById),
    [orderSummary, menuById],
  );

  const orderSubtotal = useMemo(
    () => orderSummary.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [orderSummary],
  );

  useEffect(() => {
    setSelectedLineIds(lines.map((line) => line.lineId));
    setDiscountValue(0);
    setDiscountPreset(null);
    setCustomTip(0);
    setTipPreset(null);
    setTipMode("custom");
    setPaymentMethod("cash");
    setCustomerPays("");
    setSplitCount(2);
    setSplitMode("total");
    setAccordion(null);
    setLocalError(null);
  }, [lines]);

  useEffect(() => {
    if (splitMode === "items") {
      setSelectedLineIds([]);
    } else {
      setSelectedLineIds(lines.map((line) => line.lineId));
    }
  }, [splitMode, lines]);

  useEffect(() => {
    if (!accordion) return;
    const container = scrollRef.current;
    const target = optionsRef.current;
    if (!container || !target) return;

    const timer = window.setTimeout(() => {
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const offset = targetRect.top - containerRect.top + container.scrollTop - 8;
      container.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
    }, 320);

    return () => window.clearTimeout(timer);
  }, [accordion, splitMode]);

  const baseTotals = useMemo(
    () =>
      buildCheckoutTotals({
        lines,
        discountType,
        discountValue,
        tip: 0,
        splitMode,
        splitCount,
        selectedLineIds,
        allLines: lines,
        enablePriceRounding: settings.enablePriceRounding,
      }),
    [
      lines,
      discountType,
      discountValue,
      splitMode,
      splitCount,
      selectedLineIds,
      settings.enablePriceRounding,
    ],
  );

  const customerPaysNum =
    customerPays.trim() === "" ? null : Math.max(0, Number(customerPays) || 0);
  const usingCustomerPays = customerPaysNum !== null;

  const manualTip =
    tipMode === "preset" && tipPreset !== null
      ? calcTipFromPercent(baseTotals.afterDiscount, tipPreset)
      : customTip;

  const autoTipFromPayment = usingCustomerPays
    ? Math.max(0, customerPaysNum - baseTotals.amountDueNow)
    : 0;

  const tipAmount = usingCustomerPays ? autoTipFromPayment : Math.max(0, manualTip);

  const totals = useMemo(() => {
    if (usingCustomerPays) {
      return {
        ...baseTotals,
        grandTotal: baseTotals.afterDiscount + tipAmount,
        amountDueNow: customerPaysNum,
      };
    }

    return buildCheckoutTotals({
      lines,
      discountType,
      discountValue,
      tip: tipAmount,
      splitMode,
      splitCount,
      selectedLineIds,
      allLines: lines,
      enablePriceRounding: settings.enablePriceRounding,
    });
  }, [
    usingCustomerPays,
    baseTotals,
    tipAmount,
    customerPaysNum,
    lines,
    discountType,
    discountValue,
    splitMode,
    splitCount,
    selectedLineIds,
    settings.enablePriceRounding,
  ]);

  const totalTip = tipAmount;
  const insufficientPayment =
    usingCustomerPays && customerPaysNum < baseTotals.amountDueNow;

  useEffect(() => {
    if (!onCfdUpdate || !tableLabel) return;
    const displayOrders =
      splitMode === "items" ? ordersFromLines(totals.payableLines) : orderSummary;
    onCfdUpdate(
      buildCfdCheckoutPayload(tableLabel, displayOrders, menuItems, {
        subtotal: totals.subtotal,
        discount: totals.discountAmount,
        tip: totalTip,
        grandTotal: totals.grandTotal,
        amountDueNow: totals.amountDueNow,
      }),
    );
  }, [
    onCfdUpdate,
    tableLabel,
    orderSummary,
    menuItems,
    splitMode,
    totals.payableLines,
    totals.subtotal,
    totals.discountAmount,
    totals.grandTotal,
    totals.amountDueNow,
    totalTip,
  ]);

  const insufficientCash = insufficientPayment;

  const remainingBillLines = useMemo(
    () => lines.filter((line) => !selectedLineIds.includes(line.lineId)),
    [lines, selectedLineIds],
  );

  const currentBillLines = useMemo(
    () => lines.filter((line) => selectedLineIds.includes(line.lineId)),
    [lines, selectedLineIds],
  );

  const toggleAccordion = (panel: AccordionPanel) => {
    setAccordion((prev) => (prev === panel ? null : panel));
  };

  const moveToBill = (lineId: string) => {
    setSelectedLineIds((prev) => (prev.includes(lineId) ? prev : [...prev, lineId]));
  };

  const moveToRemaining = (lineId: string) => {
    setSelectedLineIds((prev) => prev.filter((id) => id !== lineId));
  };

  const handleDiscountPreset = (percent: number) => {
    setDiscountType("percent");
    setDiscountPreset(percent);
    setDiscountValue(percent);
  };

  const handleDiscountValueChange = (raw: string) => {
    setDiscountPreset(null);
    const next = Number(raw) || 0;
    setDiscountValue(Math.min(100, Math.max(0, next)));
  };

  const handleTipPreset = (percent: number) => {
    setCustomerPays("");
    setTipMode("preset");
    setTipPreset(percent);
    setCustomTip(0);
  };

  const handleCustomTipChange = (raw: string) => {
    setCustomerPays("");
    setTipMode("custom");
    setTipPreset(null);
    setCustomTip(Math.max(0, Number(raw) || 0));
  };

  const handleCustomerPaysChange = (raw: string) => {
    setCustomerPays(raw);
    if (raw.trim() !== "") {
      setTipMode("custom");
      setTipPreset(null);
      setCustomTip(0);
    }
  };

  const customTipDisplay =
    !usingCustomerPays && tipMode === "custom" && customTip > 0 ? String(customTip) : "";

  const discountValueDisplay =
    discountValue > 0 ? String(discountValue) : "";

  const handleCheckout = async () => {
    setLocalError(null);

    if (lines.length === 0) {
      setLocalError(translate("nothingToCheckout"));
      return;
    }

    if (splitMode === "items" && totals.payableLines.length === 0) {
      setLocalError(translate("selectItemsToPay"));
      return;
    }

    if (insufficientPayment) {
      setLocalError(translate("insufficientCash"));
      return;
    }

    const paidOrders = ordersFromLines(totals.payableLines);
    const remaining = splitMode === "items" ? remainingLines(lines, selectedLineIds) : undefined;

    const chargeAmount = totals.amountDueNow;

    const payment = {
      paymentMethod,
      subtotal: totals.subtotal,
      discountType,
      discountValue,
      discountAmount: totals.discountAmount,
      tip: totalTip,
      grandTotal: usingCustomerPays ? chargeAmount : totals.grandTotal,
      amountDueNow: chargeAmount,
      amountGiven:
        paymentMethod === "cash" && usingCustomerPays ? customerPaysNum : undefined,
      changeDue: paymentMethod === "cash" && usingCustomerPays ? 0 : undefined,
      tipFromChange: usingCustomerPays && autoTipFromPayment > 0 ? autoTipFromPayment : undefined,
      splitMode,
      splitCount: splitMode === "equal" ? splitCount : 1,
    };

    const closeTable =
      splitMode === "total" ||
      (splitMode === "items" && (remaining?.length ?? 0) === 0);

    const payload: CheckoutSubmitPayload = {
      paidOrders,
      payment,
      remainingLines: remaining,
      closeTable,
    };

    if (paymentMethod === "card") {
      setPendingCheckout(payload);
      setCardTerminalOpen(true);
      setTerminalBusy(true);
      void sendCfdEvent("TERMINAL_PENDING", { amount: chargeAmount });
      return;
    }

    await submitCheckout(payload);
  };

  const submitCheckout = async (
    payload: CheckoutSubmitPayload,
    cardResult?: TerminalPaymentResponse,
  ) => {
    const enriched: CheckoutSubmitPayload = cardResult
      ? {
          ...payload,
          payment: {
            ...payload.payment,
            cardAuthCode: cardResult.authCode,
            cardLast4: cardResult.last4,
            cardBrand: cardResult.brand,
          },
        }
      : payload;

    try {
      await onCheckout(enriched);
      playPaymentSuccessSound(settings.soundConfigs.paymentSuccess);
    } finally {
      setCardTerminalOpen(false);
      setPendingCheckout(null);
      setTerminalBusy(false);
    }
  };

  const handleCardApproved = (result: TerminalPaymentResponse) => {
    if (!pendingCheckout) return;
    void submitCheckout(pendingCheckout, result);
  };

  const handleCardCancel = () => {
    setCardTerminalOpen(false);
    setPendingCheckout(null);
    setTerminalBusy(false);
    void sendCfdEvent("CANCEL_CHECKOUT", {});
  };

  const handleCardManualOverride = () => {
    requestPin(() => {
      if (!pendingCheckout) return;
      void submitCheckout(pendingCheckout);
    });
  };

  const submitLabel = confirmLabel
    ? `${confirmLabel} · ${displayPrice(totals.amountDueNow)}`
    : `${translate("checkout")} · ${displayPrice(totals.amountDueNow)}`;

  const tipControls = (
    <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-900/40">
      <PercentPresetButtons
        selected={!usingCustomerPays && tipMode === "preset" ? tipPreset : null}
        onSelect={handleTipPreset}
      />
      <label className="block">
        <span className="text-xs text-gray-500 dark:text-gray-400">{translate("customTip")}</span>
        <NumericInputField
          value={customTipDisplay}
          onChange={handleCustomTipChange}
          allowDecimal={false}
          placeholder="0 Kč"
          className="mt-1"
        />
      </label>
      {usingCustomerPays && (
        <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
          {translate("autoTipFromPayment")}: {displayPrice(autoTipFromPayment)}
        </p>
      )}
    </div>
  );

  const optionTabs = [
    { id: "split" as const, label: `✂️ ${translate("splitBill")}` },
    { id: "discount" as const, label: `🏷️ ${translate("discount")}` },
    { id: "tip" as const, label: `💡 ${translate("tip")}` },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-inherit text-gray-800 dark:text-gray-200">
      {/* Scrollable middle body */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 max-h-[calc(92vh-140px)]"
      >
        {localError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {localError}
          </p>
        )}

        <section className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="max-h-32 overflow-y-auto sm:max-h-36">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-[1] bg-gray-100 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2">{translate("itemCode")}</th>
                  <th className="px-3 py-2">{translate("itemName")}</th>
                  <th className="px-3 py-2 text-center">Qty</th>
                  <th className="px-3 py-2 text-right">{translate("price")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {summaryRows.map((row, index) => (
                  <tr key={`${row.code}-${index}`} className="text-gray-800 dark:text-gray-200">
                    <td className="px-3 py-1.5 font-mono text-[11px] text-gray-500 dark:text-gray-400">
                      {row.code}
                    </td>
                    <td className="max-w-[8rem] truncate px-3 py-1.5 font-medium sm:max-w-[12rem]">
                      {row.name}
                    </td>
                    <td className="px-3 py-1.5 text-center tabular-nums">{row.quantity}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{displayPrice(row.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-2.5 dark:border-gray-700 dark:bg-gray-900/60">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {translate("subtotal")}
            </span>
            <span className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">
              {displayPrice(orderSubtotal)}
            </span>
          </div>
        </section>

        <section ref={optionsRef} className="space-y-1.5">
          <AccordionTabBar
            active={accordion}
            onChange={toggleAccordion}
            tabs={optionTabs}
          />

          <CollapseSection open={accordion === "split"}>
            <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900/30">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["total", translate("payTotal")],
                    ["equal", translate("splitEqually")],
                    ["items", translate("payByItem")],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSplitMode(mode)}
                    className={filterButtonClass(splitMode === mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {splitMode === "equal" && (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs text-gray-500 dark:text-gray-400">
                    {translate("splitCount")}
                  </label>
                  <NumericInputField
                    value={String(splitCount)}
                    onChange={(raw) => {
                      const next = Math.min(20, Math.max(2, Number(raw) || 2));
                      setSplitCount(next);
                    }}
                    allowDecimal={false}
                    inputClassName="w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    {translate("perPerson")}: {displayPrice(baseTotals.amountDueNow)}
                  </span>
                </div>
              )}

              {splitMode === "items" && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700">
                    <p className="border-b border-gray-200 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                      {translate("remainingItems")}
                    </p>
                    <ul className="max-h-[260px] space-y-1 overflow-y-auto p-2">
                      {remainingBillLines.length === 0 ? (
                        <li className="py-6 text-center text-[11px] text-gray-400">—</li>
                      ) : (
                        remainingBillLines.map((line) => (
                          <li key={line.lineId}>
                            <button
                              type="button"
                              onClick={() => moveToBill(line.lineId)}
                              className="flex w-full items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-left text-[11px] hover:border-blue-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-blue-600"
                            >
                              <span className="min-w-0 flex-1 truncate text-gray-900 dark:text-gray-100">
                                {line.name}
                              </span>
                              <span className="shrink-0 tabular-nums text-gray-500">
                                {displayPrice(lineTotal(line))}
                              </span>
                              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>

                  <div className="rounded-lg border-2 border-blue-300 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
                    <p className="border-b border-blue-200 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-blue-800 dark:border-blue-900 dark:text-blue-200">
                      {translate("currentBill")}
                    </p>
                    <ul className="max-h-[260px] space-y-1 overflow-y-auto p-2">
                      {currentBillLines.length === 0 ? (
                        <li className="py-6 text-center text-[11px] text-gray-400">
                          {translate("selectItemsToPay")}
                        </li>
                      ) : (
                        currentBillLines.map((line) => (
                          <li key={line.lineId}>
                            <button
                              type="button"
                              onClick={() => moveToRemaining(line.lineId)}
                              className="flex w-full items-center gap-1 rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-left text-[11px] dark:border-blue-900 dark:bg-gray-900"
                            >
                              <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                              <span className="min-w-0 flex-1 truncate text-gray-900 dark:text-gray-100">
                                {line.name}
                              </span>
                              <span className="shrink-0 tabular-nums text-gray-500">
                                {displayPrice(lineTotal(line))}
                              </span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                    <div className="space-y-2 border-t border-blue-200 p-2 dark:border-blue-900">
                      <SummaryRow label={translate("subtotal")} value={displayPrice(totals.subtotal)} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CollapseSection>

          <CollapseSection open={accordion === "discount"}>
            <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900/30">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["percent", translate("discountPercent")],
                    ["fixed", translate("discountFixed")],
                  ] as const
                ).map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setDiscountType(type);
                      setDiscountPreset(null);
                    }}
                    className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                      discountType === type
                        ? "bg-orange-600 text-white"
                        : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {discountType === "percent" && (
                <PercentPresetButtons
                  selected={discountPreset}
                  onSelect={handleDiscountPreset}
                  activeClassName="bg-orange-600 text-white"
                  inactiveClassName="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                />
              )}
              <NumericInputField
                value={discountValueDisplay}
                onChange={(raw) => {
                  if (discountType === "percent") {
                    handleDiscountValueChange(raw);
                    return;
                  }
                  setDiscountPreset(null);
                  setDiscountValue(Math.max(0, Number(raw) || 0));
                }}
                allowDecimal={discountType !== "percent"}
                placeholder={discountType === "percent" ? "0 %" : "0 Kč"}
              />
            </div>
          </CollapseSection>

          <CollapseSection open={accordion === "tip"}>{tipControls}</CollapseSection>
        </section>

        <section className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-900/30">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {translate("paymentMethod")}
            </p>
            <div className="flex gap-2">
              {(["cash", "card"] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`flex-1 capitalize ${paymentFilterClass(paymentMethod === method, method)}`}
                >
                  {translate(method)}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {translate("customerPaysAmount")}
            </span>
            <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
              {translate("customerPaysHint")}
            </p>
            <NumericInputField
              value={customerPays}
              onChange={handleCustomerPaysChange}
              allowDecimal={false}
              placeholder={`${baseTotals.amountDueNow || 0} Kč`}
              className={`mt-1 ${insufficientPayment ? "[&_input]:border-red-400 dark:[&_input]:border-red-600" : ""}`}
            />
          </label>

          {usingCustomerPays && !insufficientPayment && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40">
                <SummaryRow
                  label={translate("amountDueNow")}
                  value={displayPrice(baseTotals.amountDueNow)}
                />
              </div>
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/40">
                <SummaryRow
                  label={translate("autoTipFromPayment")}
                  value={displayPrice(autoTipFromPayment)}
                  highlight
                />
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Pinned footer — grand total + confirm */}
      <footer className="sticky bottom-0 z-10 shrink-0 border-t border-gray-200 bg-inherit p-4 dark:border-gray-700">
        <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900/50">
          <div className="space-y-1">
            <SummaryRow label={translate("subtotal")} value={displayPrice(totals.subtotal)} />
            {totals.discountAmount > 0 && (
              <SummaryRow
                label={translate("discount")}
                value={`−${displayPrice(totals.discountAmount)}`}
              />
            )}
            {totalTip > 0 && (
              <SummaryRow label={translate("tip")} value={displayPrice(totalTip)} />
            )}
            <SummaryRow
              label={translate("grandTotal")}
              value={displayPrice(totals.grandTotal)}
              emphasize
            />
            {(splitMode === "equal" && splitCount > 1) ||
            (splitMode !== "equal" && totals.amountDueNow !== totals.grandTotal) ? (
              <SummaryRow
                label={translate("amountDueNow")}
                value={displayPrice(totals.amountDueNow)}
                highlight
              />
            ) : null}
          </div>
        </div>

        <button
          type="button"
          disabled={isSaving || terminalBusy || lines.length === 0 || insufficientCash}
          onClick={() => void handleCheckout()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-base font-bold text-white shadow-sm disabled:opacity-40"
        >
          <Printer className="h-5 w-5 shrink-0" />
          <span className="truncate">
            {isSaving || terminalBusy ? "..." : submitLabel}
          </span>
        </button>
      </footer>

      <CardPaymentModal
        open={cardTerminalOpen}
        amount={pendingCheckout?.payment.amountDueNow ?? totals.amountDueNow}
        terminalConfig={{
          terminalType: settings.terminalType,
          terminalIp: settings.terminalIp,
          terminalPort: settings.terminalPort,
          terminalPosId: settings.terminalPosId,
          terminalConnectionMode: settings.terminalConnectionMode,
        }}
        onApproved={handleCardApproved}
        onCancel={handleCardCancel}
        onManualOverride={handleCardManualOverride}
      />
    </div>
  );
}

export type { CheckoutLine, CheckoutSubmitPayload };
