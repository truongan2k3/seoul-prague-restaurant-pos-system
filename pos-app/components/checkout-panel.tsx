"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ArrowLeft, ArrowRight, Printer } from "lucide-react";
import { NumericInputField } from "@/components/numeric-input-field";
import { PercentPresetButtons } from "@/components/percent-preset-buttons";
import { useApp } from "@/contexts/app-context";
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
import { buildCfdCheckoutPayload, type CfdCheckoutPayload } from "@/lib/cfd-display";
import { playPaymentSuccessSound } from "@/lib/notification-sound";
import type { MenuItem, OrderItem, PaymentMethod } from "@/lib/types";
import { filterButtonClass, paymentFilterClass } from "@/lib/theme-classes";

type CheckoutPanelView = "main" | "split" | "discount" | "tip";

interface CheckoutPanelProps {
  lines: CheckoutLine[];
  orderSummary: OrderItem[];
  menuItems: MenuItem[];
  tableLabel?: string;
  isSaving?: boolean;
  onCheckout: (payload: CheckoutSubmitPayload) => void | Promise<void>;
  onCfdUpdate?: (payload: CfdCheckoutPayload) => void;
  confirmLabel?: string;
  className?: string;
  sessionResetKey?: number;
}

function SummaryRow({
  label,
  value,
  emphasize,
  highlight,
  large,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  highlight?: boolean;
  large?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 ${
        large ? "text-base" : emphasize ? "text-sm font-bold" : "text-sm"
      } ${highlight ? "text-emerald-700 dark:text-emerald-400" : ""}`}
    >
      <span className={emphasize || large ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"}>
        {label}
      </span>
      <span
        className={`shrink-0 tabular-nums ${
          large ? "text-xl font-bold" : emphasize ? "text-lg text-gray-900 dark:text-gray-100" : "font-medium text-gray-800 dark:text-gray-200"
        }`}
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
  className = "",
  sessionResetKey = 0,
}: CheckoutPanelProps) {
  const { translate } = useApp();
  const { settings } = useSettings();
  const priceOptions = useMemo(
    () => priceDisplayOptionsFromSettings(settings),
    [settings],
  );
  const displayPrice = useCallback(
    (amount: number) => formatPosPrice(amount, priceOptions),
    [priceOptions],
  );
  const keyboardPortalTargetId = "checkout-numeric-keyboard-dock";

  const [panelView, setPanelView] = useState<CheckoutPanelView>("main");
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountValue, setDiscountValue] = useState(0);
  const [discountPreset, setDiscountPreset] = useState<number | null>(null);
  const [tipMode, setTipMode] = useState<"preset" | "custom">("custom");
  const [tipPreset, setTipPreset] = useState<number | null>(null);
  const [customTip, setCustomTip] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [cashGiven, setCashGiven] = useState("");
  const [roundUpTotal, setRoundUpTotal] = useState("");
  const [splitMode, setSplitMode] = useState<SplitMode>("total");
  const [splitCount, setSplitCount] = useState(2);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [printReceipt, setPrintReceipt] = useState(settings.autoPrintOnPayment);
  const splitSessionRef = useRef<{ active: boolean; mode: SplitMode; count: number }>({
    active: false,
    mode: "items",
    count: 2,
  });
  const [equalPaymentsMade, setEqualPaymentsMade] = useState(0);
  const linesRef = useRef(lines);
  linesRef.current = lines;

  useEffect(() => {
    setPrintReceipt(settings.autoPrintOnPayment);
  }, [settings.autoPrintOnPayment]);

  const resetCheckoutForm = useCallback(() => {
    const currentLines = linesRef.current;
    setSelectedLineIds(currentLines.map((line) => line.lineId));
    setDiscountValue(0);
    setDiscountPreset(null);
    setCustomTip(0);
    setTipPreset(null);
    setTipMode("custom");
    setPaymentMethod("card");
    setCashGiven("");
    setRoundUpTotal("");
    setSplitCount(2);
    setSplitMode("total");
    setPanelView("main");
    setLocalError(null);
    setEqualPaymentsMade(0);
    splitSessionRef.current = { active: false, mode: "total", count: 2 };
  }, []);

  useEffect(() => {
    resetCheckoutForm();
  }, [sessionResetKey, resetCheckoutForm]);

  useEffect(() => {
    if (splitMode !== "total") {
      splitSessionRef.current = { active: true, mode: splitMode, count: splitCount };
    }
  }, [splitMode, splitCount]);

  useEffect(() => {
    const session = splitSessionRef.current;
    if (!session.active || session.mode === "total") {
      setSelectedLineIds(lines.map((line) => line.lineId));
      return;
    }

    setSplitMode(session.mode);
    setSplitCount(session.count);
    setPanelView("split");
    if (session.mode === "items") {
      setSelectedLineIds([]);
    } else {
      setSelectedLineIds(lines.map((line) => line.lineId));
    }
    setCashGiven("");
    setRoundUpTotal("");
    setLocalError(null);
  }, [lines]);

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
    if (splitMode === "items") {
      setSelectedLineIds([]);
    } else {
      setSelectedLineIds(lines.map((line) => line.lineId));
    }
  }, [splitMode, lines]);

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

  const parseAmountField = (raw: string) =>
    raw.trim() === "" ? null : Math.max(0, Number(raw) || 0);

  const cashGivenNum = parseAmountField(cashGiven);
  const roundUpNum = parseAmountField(roundUpTotal);
  const usingCashGiven = cashGivenNum !== null;
  const usingRoundUp = roundUpNum !== null;

  const manualTip =
    tipMode === "preset" && tipPreset !== null
      ? calcTipFromPercent(baseTotals.afterDiscount, tipPreset)
      : customTip;

  const billAmount = baseTotals.amountDueNow;
  const roundUpTip = usingRoundUp ? Math.max(0, roundUpNum - billAmount) : 0;
  const tipAmount = usingRoundUp ? roundUpTip : Math.max(0, manualTip);

  const totals = useMemo(() => {
    if (usingRoundUp) {
      return {
        ...baseTotals,
        grandTotal: roundUpNum!,
        amountDueNow: roundUpNum!,
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
    usingRoundUp,
    roundUpNum,
    baseTotals,
    lines,
    discountType,
    discountValue,
    tipAmount,
    splitMode,
    splitCount,
    selectedLineIds,
    settings.enablePriceRounding,
  ]);

  const chargeTotal = totals.amountDueNow;
  const changeDueAmount =
    usingCashGiven && !usingRoundUp ? Math.max(0, cashGivenNum - chargeTotal) : 0;
  const totalTip = tipAmount;
  const insufficientPayment =
    (usingCashGiven && cashGivenNum < chargeTotal) ||
    (usingRoundUp && roundUpNum < billAmount);

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
        amountGiven:
          paymentMethod === "cash" && usingCashGiven && !insufficientPayment
            ? cashGivenNum
            : undefined,
        changeDue:
          paymentMethod === "cash" && usingCashGiven && !usingRoundUp && !insufficientPayment
            ? changeDueAmount
            : undefined,
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
    paymentMethod,
    usingCashGiven,
    usingRoundUp,
    insufficientPayment,
    cashGivenNum,
    changeDueAmount,
  ]);

  const remainingBillLines = useMemo(
    () => lines.filter((line) => !selectedLineIds.includes(line.lineId)),
    [lines, selectedLineIds],
  );

  const currentBillLines = useMemo(
    () => lines.filter((line) => selectedLineIds.includes(line.lineId)),
    [lines, selectedLineIds],
  );

  const moveToBill = (lineId: string) => {
    setSelectedLineIds((prev) => (prev.includes(lineId) ? prev : [...prev, lineId]));
  };

  const moveToRemaining = (lineId: string) => {
    setSelectedLineIds((prev) => prev.filter((id) => id !== lineId));
  };

  const moveAllToBill = () => {
    setSelectedLineIds(lines.map((line) => line.lineId));
  };

  const moveAllToRemaining = () => {
    setSelectedLineIds([]);
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
    setRoundUpTotal("");
    if (tipMode === "preset" && tipPreset === percent) {
      setTipMode("custom");
      setTipPreset(null);
      setCustomTip(0);
      return;
    }
    setTipMode("preset");
    setTipPreset(percent);
    setCustomTip(0);
  };

  const handleCustomTipChange = (raw: string) => {
    setRoundUpTotal("");
    setTipMode("custom");
    setTipPreset(null);
    setCustomTip(Math.max(0, Number(raw) || 0));
  };

  const handleCashGivenChange = (raw: string) => {
    setCashGiven(raw);
    if (raw.trim() !== "") setRoundUpTotal("");
  };

  const handleRoundUpChange = (raw: string) => {
    setRoundUpTotal(raw);
    if (raw.trim() !== "") {
      setCashGiven("");
      setTipMode("custom");
      setTipPreset(null);
      setCustomTip(0);
    }
  };

  const customTipDisplay =
    !usingRoundUp && tipMode === "custom" && customTip > 0 ? String(customTip) : "";
  const discountValueDisplay = discountValue > 0 ? String(discountValue) : "";

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

    const payment = {
      paymentMethod,
      subtotal: totals.subtotal,
      discountType,
      discountValue,
      discountAmount: totals.discountAmount,
      tip: totalTip,
      grandTotal: chargeTotal,
      amountDueNow: chargeTotal,
      amountGiven:
        paymentMethod === "cash" && usingCashGiven
          ? cashGivenNum
          : usingRoundUp
            ? roundUpNum
            : undefined,
      changeDue:
        paymentMethod === "cash" && usingCashGiven && !usingRoundUp
          ? changeDueAmount
          : usingRoundUp
            ? 0
            : undefined,
      tipFromChange: usingRoundUp && roundUpTip > 0 ? roundUpTip : undefined,
      splitMode,
      splitCount: splitMode === "equal" ? splitCount : 1,
    };

    const closeTable =
      splitMode === "total" ||
      (splitMode === "items" && (remaining?.length ?? 0) === 0) ||
      (splitMode === "equal" && equalPaymentsMade + 1 >= splitCount);

    await submitCheckout({
      paidOrders,
      payment,
      remainingLines: remaining,
      closeTable,
      printReceipt,
    });
  };

  const submitCheckout = async (payload: CheckoutSubmitPayload) => {
    await onCheckout(payload);
    playPaymentSuccessSound(settings.soundConfigs.paymentSuccess);

    if (!payload.closeTable && payload.payment.splitMode !== "total") {
      const mode = payload.payment.splitMode;
      const count = mode === "equal" ? payload.payment.splitCount : splitCount;
      splitSessionRef.current = { active: true, mode, count };
      setSplitMode(mode);
      setSplitCount(count);
      setPanelView("split");
      setCashGiven("");
      setRoundUpTotal("");
      if (mode === "equal") {
        setEqualPaymentsMade((count) => count + 1);
      }
      if (mode === "items") {
        setSelectedLineIds([]);
      }
    }
  };

  const submitLabel = confirmLabel
    ? `${confirmLabel} · ${displayPrice(totals.amountDueNow)}`
    : `${translate("checkout")} · ${displayPrice(totals.amountDueNow)}`;

  const splitActive = splitMode !== "total";
  const inSplitLayout = panelView === "split" || (panelView === "discount" && splitMode !== "total");
  const discountActive = totals.discountAmount > 0;
  const tipActive = totalTip > 0;

  const optionButtonClass = (active: boolean) =>
    `min-h-[52px] flex-1 rounded-xl border px-3 py-3 text-base font-semibold transition-colors sm:min-h-[56px] sm:text-lg ${
      active
        ? "border-blue-400 bg-blue-50 text-blue-900 dark:border-blue-600 dark:bg-blue-950/40 dark:text-blue-100"
        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
    }`;

  const togglePanel = (panel: CheckoutPanelView) => {
    if (panel === "split") {
      if (panelView === "split") {
        setPanelView("main");
        return;
      }
      setSplitMode("items");
      setSelectedLineIds([]);
      setPanelView("split");
      return;
    }
    setPanelView((prev) => (prev === panel ? "main" : panel));
  };

  const openDiscountFromSplit = () => setPanelView("discount");

  const optionTabClass = (panel: CheckoutPanelView) =>
    optionButtonClass(panelView === panel || (panel === "split" && splitActive && panelView === "main"));

  const discountPanelContent = (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
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
            className={`min-h-[52px] flex-1 rounded-xl py-3 text-base font-semibold sm:text-lg ${
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
        keyboardPortalTargetId={keyboardPortalTargetId}
      />
    </div>
  );

  const tipPanelContent = (
    <div className="space-y-4">
      <PercentPresetButtons
        selected={!usingRoundUp && tipMode === "preset" ? tipPreset : null}
        onSelect={handleTipPreset}
      />
      <label className="block">
        <span className="text-base font-medium text-gray-600 dark:text-gray-300">{translate("customTip")}</span>
        <NumericInputField
          value={customTipDisplay}
          onChange={handleCustomTipChange}
          allowDecimal={false}
          placeholder="0 Kč"
          className="mt-2"
          keyboardPortalTargetId={keyboardPortalTargetId}
        />
      </label>
      {usingRoundUp && (
        <p className="text-base text-emerald-700 dark:text-emerald-400">
          {translate("autoTipFromPayment")}: {displayPrice(roundUpTip)}
        </p>
      )}
    </div>
  );

  const paymentDetailsContent = (options: { showTip?: boolean; compact?: boolean } = {}) => {
    const { showTip = false, compact = false } = options;
    return (
      <div className="space-y-4">
        {!compact && (
          <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/70 px-6 py-5 dark:border-blue-900 dark:bg-blue-950/30">
            <p className="text-sm font-bold uppercase tracking-wide text-blue-800 dark:text-blue-200">
              {translate("amountDueNow")}
            </p>
            <p className="mt-2 text-4xl font-bold tabular-nums text-blue-950 sm:text-5xl dark:text-blue-50">
              {displayPrice(billAmount)}
            </p>
          </div>
        )}

        {showTip && (
          <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 dark:border-gray-700 dark:bg-gray-900/50">
            <p className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {translate("tip")}
            </p>
            {tipPanelContent}
          </div>
        )}

        {paymentMethod === "cash" && (
          <label className="block">
            <span className="text-base font-semibold text-gray-600 dark:text-gray-300">
              {translate("amountGiven")}
            </span>
            <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
              {translate("cashReceivedHint")}
            </p>
            <NumericInputField
              id="checkout-cash-given"
              value={cashGiven}
              onChange={handleCashGivenChange}
              allowDecimal={false}
              placeholder={displayPrice(chargeTotal)}
              className={`mt-1 ${insufficientPayment && usingCashGiven ? "[&_input]:border-red-400 dark:[&_input]:border-red-600" : ""}`}
              keyboardPortalTargetId={keyboardPortalTargetId}
            />
          </label>
        )}

        <label className="block">
          <span className="text-base font-semibold text-gray-600 dark:text-gray-300">
            {translate("roundUpTotal")}
          </span>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            {translate("roundUpTotalHint")}
          </p>
          <NumericInputField
            id="checkout-round-up"
            value={roundUpTotal}
            onChange={handleRoundUpChange}
            allowDecimal={false}
            placeholder={displayPrice(billAmount)}
            className={`mt-1 ${insufficientPayment && usingRoundUp ? "[&_input]:border-red-400 dark:[&_input]:border-red-600" : ""}`}
            keyboardPortalTargetId={keyboardPortalTargetId}
          />
        </label>

        {insufficientPayment && (
          <p className="text-base font-medium text-red-600 dark:text-red-400">
            {translate("insufficientCash")}
          </p>
        )}

        {usingCashGiven && !usingRoundUp && !insufficientPayment && changeDueAmount > 0 && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 dark:border-amber-800 dark:bg-amber-950/40">
            <SummaryRow large label={translate("changeDue")} value={displayPrice(changeDueAmount)} />
          </div>
        )}

        {usingRoundUp && !insufficientPayment && roundUpTip > 0 && (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4 dark:border-emerald-800 dark:bg-emerald-950/40">
            <SummaryRow large label={translate("tipFromChange")} value={displayPrice(roundUpTip)} highlight />
          </div>
        )}
      </div>
    );
  };

  const splitPaymentSummary = (
    <div className="space-y-2 rounded-xl border border-gray-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-900/50 sm:space-y-3 sm:rounded-2xl sm:px-4 sm:py-4">
      <SummaryRow label={translate("subtotal")} value={displayPrice(totals.subtotal)} />
      {discountActive ? (
        <SummaryRow
          label={translate("discount")}
          value={`−${displayPrice(totals.discountAmount)}`}
          highlight
        />
      ) : (
        <button
          type="button"
          onClick={openDiscountFromSplit}
          className="text-xs font-medium text-orange-600 hover:text-orange-700 sm:text-sm dark:text-orange-400"
        >
          + {translate("discount")}
        </button>
      )}
      {discountActive && (
        <button
          type="button"
          onClick={openDiscountFromSplit}
          className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400"
        >
          {translate("discount")}…
        </button>
      )}
      {tipActive && (
        <SummaryRow label={translate("tip")} value={displayPrice(totalTip)} highlight />
      )}
      <div className="border-t border-dashed border-gray-200 pt-2 sm:pt-3 dark:border-gray-700">
        <SummaryRow
          large
          emphasize
          label={translate("amountDueNow")}
          value={displayPrice(totals.amountDueNow)}
        />
      </div>
    </div>
  );

  const splitModePicker = (
    <div className="flex flex-wrap gap-3">
      {(
        [
          ["equal", translate("splitEqually")],
          ["items", translate("payByItem")],
        ] as const
      ).map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          onClick={() => setSplitMode(mode)}
          className={`min-h-[48px] flex-1 rounded-xl px-4 py-2.5 text-base font-semibold sm:min-h-[52px] ${filterButtonClass(splitMode === mode)}`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const splitItemsLeftPanel = (
    <div className="flex min-h-0 flex-1 flex-col">
      {splitMode === "items" ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
          <div className="flex min-h-0 flex-col rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-3 py-2 sm:px-4 sm:py-3 dark:border-gray-700">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500 sm:text-sm dark:text-gray-400">
                {translate("remainingItems")}
              </p>
              {remainingBillLines.length > 0 && (
                <button
                  type="button"
                  onClick={moveAllToBill}
                  className="shrink-0 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-blue-700 hover:border-blue-400 hover:bg-blue-50 dark:border-gray-600 dark:bg-gray-800 dark:text-blue-300 dark:hover:border-blue-600"
                  title={translate("splitMoveAllToBill")}
                >
                  {translate("splitMoveAllToBill")}
                </button>
              )}
            </div>
            <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2 sm:space-y-2 sm:p-3">
              {remainingBillLines.length === 0 ? (
                <li className="py-8 text-center text-sm text-gray-400 sm:text-base">—</li>
              ) : (
                remainingBillLines.map((line) => (
                  <li key={line.lineId}>
                    <button
                      type="button"
                      onClick={() => moveToBill(line.lineId)}
                      className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm hover:border-blue-400 sm:gap-3 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-base dark:border-gray-600 dark:bg-gray-900 dark:hover:border-blue-600"
                    >
                      <span className="min-w-0 flex-1 font-medium text-gray-900 dark:text-gray-100">{line.name}</span>
                      <span className="shrink-0 tabular-nums text-sm font-semibold text-gray-600 sm:text-base">{displayPrice(lineTotal(line))}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-blue-600 sm:h-5 sm:w-5" />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="flex min-h-0 flex-col rounded-xl border-2 border-blue-300 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-blue-200 px-3 py-2 sm:px-4 sm:py-3 dark:border-blue-900">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-800 sm:text-sm dark:text-blue-200">
                {translate("currentBill")}
              </p>
              {currentBillLines.length > 0 && (
                <button
                  type="button"
                  onClick={moveAllToRemaining}
                  className="shrink-0 rounded-md border border-blue-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:border-gray-400 hover:bg-gray-50 dark:border-blue-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-gray-600"
                  title={translate("splitMoveAllToRemaining")}
                >
                  {translate("splitMoveAllToRemaining")}
                </button>
              )}
            </div>
            <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2 sm:space-y-2 sm:p-3">
              {currentBillLines.length === 0 ? (
                <li className="py-8 text-center text-sm text-gray-500 sm:text-base">{translate("selectItemsToPay")}</li>
              ) : (
                currentBillLines.map((line) => (
                  <li key={line.lineId}>
                    <button
                      type="button"
                      onClick={() => moveToRemaining(line.lineId)}
                      className="flex w-full items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-left text-sm sm:gap-3 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-base dark:border-blue-900 dark:bg-gray-900"
                    >
                      <ArrowLeft className="h-4 w-4 shrink-0 text-gray-400 sm:h-5 sm:w-5" />
                      <span className="min-w-0 flex-1 font-medium text-gray-900 dark:text-gray-100">{line.name}</span>
                      <span className="shrink-0 tabular-nums text-sm font-semibold text-gray-600 sm:text-base">{displayPrice(lineTotal(line))}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-gray-200 dark:border-gray-700">
          <p className="shrink-0 border-b border-gray-200 px-4 py-3 text-sm font-bold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {translate("itemName")}
          </p>
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {lines.map((line) => (
              <li
                key={line.lineId}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-600 dark:bg-gray-900"
              >
                <span className="min-w-0 flex-1 font-medium text-gray-900 dark:text-gray-100">{line.name}</span>
                <span className="shrink-0 tabular-nums font-semibold text-gray-600">{displayPrice(lineTotal(line))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  const equalSplitControls = splitMode === "equal" && (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-900/40 sm:text-base">
      <label className="font-medium text-gray-600 dark:text-gray-300">{translate("splitCount")}</label>
      <NumericInputField
        value={String(splitCount)}
        onChange={(raw) => {
          const next = Math.min(20, Math.max(2, Number(raw) || 2));
          setSplitCount(next);
        }}
        allowDecimal={false}
        inputClassName="w-20 rounded-lg border border-gray-200 px-3 py-2 text-base text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        keyboardPortalTargetId={keyboardPortalTargetId}
      />
      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
        {translate("perPerson")}: {displayPrice(baseTotals.amountDueNow)}
      </span>
      {splitCount > 1 && (
        <span className="font-semibold text-blue-700 dark:text-blue-300">
          {translate("splitPaymentProgress")
            .replace("{current}", String(equalPaymentsMade + 1))
            .replace("{total}", String(splitCount))}
        </span>
      )}
    </div>
  );

  const compactCheckoutFooter = (
    <div className={`flex gap-3 border-t border-gray-200 pt-3 dark:border-gray-700 ${inSplitLayout ? "flex-col" : "flex-col sm:flex-row sm:items-center"}`}>
      <label className={`flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-200 ${inSplitLayout ? "" : "sm:shrink-0"}`}>
        <Printer className="h-4 w-4 shrink-0 text-gray-500" />
        <span className={inSplitLayout ? "text-xs sm:text-sm" : ""}>{translate("checkoutPrintReceipt")}</span>
        <input
          type="checkbox"
          checked={printReceipt}
          onChange={(event) => setPrintReceipt(event.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
      </label>
      <button
        type="button"
        disabled={isSaving || lines.length === 0 || insufficientPayment}
        onClick={() => void handleCheckout()}
        className={`flex items-center justify-center gap-2 rounded-xl bg-emerald-600 font-bold text-white shadow-sm disabled:opacity-40 ${
          inSplitLayout
            ? "min-h-[52px] w-full px-3 py-3 text-sm sm:text-base"
            : "min-h-[56px] w-full flex-1 gap-3 py-4 text-lg sm:min-h-[64px] sm:py-5 sm:text-xl"
        }`}
      >
        <Printer className={`shrink-0 ${inSplitLayout ? "h-5 w-5" : "h-6 w-6"}`} />
        <span className="truncate text-center leading-snug">{isSaving ? "..." : submitLabel}</span>
      </button>
    </div>
  );

  return (
    <div className={`flex min-h-0 flex-1 flex-col bg-inherit text-gray-800 dark:text-gray-200 ${className}`}>
      {localError && (
        <p className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {localError}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {inSplitLayout ? (
          <>
            {/* Split — left 3/4: item picker */}
            <aside className="flex min-h-0 flex-col border-b border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-900/40 lg:w-3/4 lg:border-b-0 lg:border-r">
              <div className="shrink-0 space-y-3 border-b border-gray-200 px-4 py-3 sm:px-5 sm:py-4 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setPanelView("main");
                      setSplitMode("total");
                      setSelectedLineIds(lines.map((line) => line.lineId));
                    }}
                    className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
                  >
                    <ArrowLeft className="h-4 w-4 shrink-0" />
                    {translate("payment")}
                  </button>
                  <h3 className="min-w-0 flex-1 text-lg font-bold text-gray-900 sm:text-xl dark:text-gray-100">
                    ✂️ {translate("splitBill")}
                  </h3>
                </div>
                {tableLabel && (
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {translate("table")} {tableLabel}
                  </p>
                )}
                {splitModePicker}
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 sm:px-5 sm:py-4">{splitItemsLeftPanel}</div>
            </aside>

            {/* Split — right 1/4: summary + payment */}
            <div className="flex min-h-0 min-w-0 flex-col lg:w-1/4">
              <div className="shrink-0 border-b border-gray-200 px-3 py-3 sm:px-4 dark:border-gray-700">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500 sm:text-sm dark:text-gray-400">
                  {translate("paymentMethod")}
                </p>
                <div className="flex flex-col gap-2">
                  {(["cash", "card"] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`min-h-[44px] w-full text-sm font-semibold capitalize sm:min-h-[48px] sm:text-base ${paymentFilterClass(paymentMethod === method, method)}`}
                    >
                      {translate(method)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3 sm:px-4">
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
                  {panelView === "discount" ? (
                    <>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setPanelView("split")}
                          className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400"
                        >
                          <ArrowLeft className="h-4 w-4" />
                          {translate("splitBill")}
                        </button>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                          {translate("discount")}
                        </h3>
                      </div>
                      {discountPanelContent}
                    </>
                  ) : (
                    <>
                      {splitPaymentSummary}
                      {equalSplitControls}
                      <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-900/50 sm:rounded-2xl sm:px-4 sm:py-4">
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500 sm:mb-3 sm:text-sm dark:text-gray-400">
                          {translate("tip")}
                        </p>
                        {tipPanelContent}
                      </div>
                      {paymentDetailsContent({ showTip: false, compact: true })}
                    </>
                  )}
                </div>
                {panelView !== "discount" && compactCheckoutFooter}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Left — receipt-style bill preview */}
            <aside className="flex min-h-0 flex-col border-b border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-900/40 lg:w-1/2 lg:border-b-0 lg:border-r xl:w-[48%]">
              <div className="shrink-0 border-b border-dashed border-gray-300 px-6 py-4 dark:border-gray-600">
                <p className="text-center text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                  {translate("paymentSummary")}
                </p>
                {tableLabel && (
                  <p className="mt-2 text-center text-xl font-bold text-gray-900 sm:text-2xl dark:text-gray-100">
                    {translate("table")} {tableLabel}
                  </p>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8">
                <div className="mx-auto max-w-2xl font-mono text-base leading-relaxed text-gray-900 sm:text-lg dark:text-gray-100">
                  <div className="mb-3 flex justify-between border-b border-dashed border-gray-400 pb-2 text-sm font-bold uppercase text-gray-500 dark:border-gray-500 dark:text-gray-400">
                    <span>{translate("itemName")}</span>
                    <span>{translate("price")}</span>
                  </div>
                  <ul className="space-y-3">
                    {summaryRows.map((row, index) => (
                      <li key={`${row.code}-${index}`} className="border-b border-dotted border-gray-200 pb-3 dark:border-gray-700">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <span className="text-sm text-gray-500 dark:text-gray-400">{row.code}</span>
                            <p className="text-lg font-semibold sm:text-xl">{row.name}</p>
                            {row.quantity > 1 && (
                              <p className="text-sm text-gray-500">× {row.quantity}</p>
                            )}
                          </div>
                          <span className="shrink-0 text-lg font-bold tabular-nums sm:text-xl">{displayPrice(row.lineTotal)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="my-4 border-b-2 border-dashed border-gray-800 dark:border-gray-300" />
                  <div className="flex justify-between text-lg font-bold sm:text-xl">
                    <span>{translate("subtotal")}</span>
                    <span className="tabular-nums">{displayPrice(orderSubtotal)}</span>
                  </div>
                  {discountActive && (
                    <div className="mt-2 flex justify-between text-base text-orange-700 sm:text-lg dark:text-orange-400">
                      <span>{translate("discount")}</span>
                      <span className="tabular-nums">−{displayPrice(totals.discountAmount)}</span>
                    </div>
                  )}
                  {tipActive && (
                    <div className="mt-2 flex justify-between text-base text-emerald-700 sm:text-lg dark:text-emerald-400">
                      <span>{translate("tip")}</span>
                      <span className="tabular-nums">{displayPrice(totalTip)}</span>
                    </div>
                  )}
                  <div className="mt-3 flex justify-between border-t-2 border-gray-800 pt-3 text-xl font-bold sm:text-2xl dark:border-gray-300">
                    <span>{translate("grandTotal")}</span>
                    <span className="tabular-nums">{displayPrice(totals.grandTotal)}</span>
                  </div>
                  {(splitMode === "equal" && splitCount > 1) ||
                  (splitMode !== "equal" && totals.amountDueNow !== totals.grandTotal) ? (
                    <div className="mt-2 flex justify-between text-lg font-bold text-blue-800 sm:text-xl dark:text-blue-300">
                      <span>{translate("amountDueNow")}</span>
                      <span className="tabular-nums">{displayPrice(totals.amountDueNow)}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </aside>

            {/* Right — panel area */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:w-1/2 xl:w-[52%]">
              <div className="shrink-0 space-y-4 border-b border-gray-200 bg-inherit px-5 py-4 sm:px-8 dark:border-gray-700">
                <div className="flex gap-3">
                  <button type="button" onClick={() => togglePanel("split")} className={optionTabClass("split")}>
                    ✂️ {translate("splitBill")}
                  </button>
                  <button type="button" onClick={() => togglePanel("discount")} className={optionTabClass("discount")}>
                    🏷️ {translate("discount")}
                  </button>
                  <button type="button" onClick={() => togglePanel("tip")} className={optionTabClass("tip")}>
                    💡 {translate("tip")}
                  </button>
                </div>
                <div>
                  <p className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {translate("paymentMethod")}
                  </p>
                  <div className="flex gap-3">
                    {(["cash", "card"] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={`min-h-[56px] flex-1 text-lg font-semibold capitalize sm:min-h-[64px] sm:text-xl ${paymentFilterClass(paymentMethod === method, method)}`}
                      >
                        {translate(method)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4 sm:px-8 sm:py-5">
                {panelView === "discount" && (
                  <div className="mb-3 shrink-0 flex items-center gap-3">
                    {splitActive && (
                      <button
                        type="button"
                        onClick={() => setPanelView("split")}
                        className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        {translate("splitBill")}
                      </button>
                    )}
                    <h3 className="text-xl font-bold text-gray-900 sm:text-2xl dark:text-gray-100">
                      {translate("discount")}
                    </h3>
                  </div>
                )}
                {panelView === "tip" && (
                  <div className="mb-3 shrink-0">
                    <h3 className="text-xl font-bold text-gray-900 sm:text-2xl dark:text-gray-100">
                      {translate("tip")}
                    </h3>
                  </div>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto">
                  {panelView === "discount" && discountPanelContent}
                  {panelView === "tip" && tipPanelContent}
                  {panelView === "main" && paymentDetailsContent()}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div
        id={keyboardPortalTargetId}
        className="empty:hidden shrink-0 border-t border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-900/80"
      />

      {!inSplitLayout && (
        <footer className="shrink-0 border-t border-gray-200 bg-inherit px-5 py-4 sm:px-6 dark:border-gray-700">
          {compactCheckoutFooter}
        </footer>
      )}
    </div>
  );
}

export type { CheckoutLine, CheckoutSubmitPayload };
