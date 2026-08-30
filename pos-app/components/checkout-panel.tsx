"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ArrowLeft, ArrowRight, Calculator, Printer } from "lucide-react";
import { FloatingCalculator } from "@/components/floating-calculator";
import {
  NumericInputField,
  type NumericInputFieldHandle,
} from "@/components/numeric-input-field";
import {
  CHECKOUT_PERCENT_PRESETS,
  PercentPresetButtons,
} from "@/components/percent-preset-buttons";
import { useApp } from "@/contexts/app-context";
import { useReceiptPrint } from "@/contexts/receipt-print-context";
import { useSettings } from "@/contexts/settings-context";
import {
  buildCheckoutTotals,
  calcTipFromPercent,
  lineTotal,
  mergeCheckoutLines,
  remainingLines,
  scaleOrdersForEqualSplit,
  ordersFromLines,
  type CheckoutLine,
  type CheckoutSubmitPayload,
  type DiscountType,
  type EqualAdjustScope,
  type SplitMode,
} from "@/lib/checkout-calculations";
import { formatEurFromCzk } from "@/lib/currency";
import { formatPosPrice, priceDisplayOptionsFromSettings } from "@/lib/price-display";
import { buildReceiptLines } from "@/lib/receipt-calculations";
import { buildCfdCheckoutPayload, type CfdCheckoutPayload } from "@/lib/cfd-display";
import { playPaymentSuccessSound } from "@/lib/notification-sound";
import {
  clearEqualSplitSession,
  loadEqualSplitSession,
  persistEqualSplitSession,
} from "@/lib/equal-split-session";
import {
  clearItemSplitSession,
  loadItemSplitSession,
  persistItemSplitSession,
} from "@/lib/item-split-session";
import type { MenuItem, OrderItem, PaymentMethod } from "@/lib/types";
import { filterButtonClass } from "@/lib/theme-classes";

type CheckoutPanelView = "main" | "split";
type AdjustmentMode = "tip" | "discount" | null;
type SplitPhase = "pick-items" | "checkout";

interface CheckoutPanelProps {
  lines: CheckoutLine[];
  orderSummary: OrderItem[];
  menuItems: MenuItem[];
  tableLabel?: string;
  tableId?: string;
  isSaving?: boolean;
  onCheckout: (payload: CheckoutSubmitPayload) => void | Promise<void>;
  onCfdUpdate?: (payload: CfdCheckoutPayload) => void;
  confirmLabel?: string;
  className?: string;
  sessionResetKey?: number;
  /** Restore in-progress equal-split after reopening payment. */
  initialEqualPaymentsMade?: number;
  initialEqualSplitCount?: number;
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
  tableId,
  isSaving = false,
  onCheckout,
  onCfdUpdate,
  confirmLabel,
  className = "",
  sessionResetKey = 0,
  initialEqualPaymentsMade = 0,
  initialEqualSplitCount = 0,
}: CheckoutPanelProps) {
  const { translate, staff } = useApp();
  const { printProvisionalBill } = useReceiptPrint();
  const { settings } = useSettings();
  const priceOptions = useMemo(
    () => priceDisplayOptionsFromSettings(settings),
    [settings],
  );
  const displayPrice = useCallback(
    (amount: number) => formatPosPrice(amount, priceOptions),
    [priceOptions],
  );
  const displayCzkOnly = useCallback(
    (amount: number) => formatPosPrice(amount, { enableRounding: priceOptions.enableRounding }),
    [priceOptions],
  );
  const eurSecondary = useCallback(
    (amount: number) =>
      priceOptions.showEur
        ? formatEurFromCzk(amount, priceOptions.eurRate)
        : null,
    [priceOptions],
  );

  const customAmountRef = useRef<NumericInputFieldHandle>(null);
  const cashGivenRef = useRef<NumericInputFieldHandle>(null);

  const [panelView, setPanelView] = useState<CheckoutPanelView>("main");
  const [splitPhase, setSplitPhase] = useState<SplitPhase>("checkout");
  const [adjustmentMode, setAdjustmentMode] = useState<AdjustmentMode>(null);
  const [keepChangeAsTip, setKeepChangeAsTip] = useState(false);
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
  const [equalAdjustScope, setEqualAdjustScope] = useState<EqualAdjustScope>("person");
  const [splitCountInput, setSplitCountInput] = useState("2");
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const splitCount = useMemo(() => {
    const trimmed = splitCountInput.trim();
    if (!trimmed) return 2;
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) return 2;
    return Math.min(20, Math.max(2, Math.floor(parsed)));
  }, [splitCountInput]);
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

  const resetPaymentAdjustments = useCallback(() => {
    setDiscountValue(0);
    setDiscountPreset(null);
    setCustomTip(0);
    setTipPreset(null);
    setTipMode("custom");
    setAdjustmentMode(null);
    setKeepChangeAsTip(false);
    setRoundUpTotal("");
  }, []);

  const clearCashOnly = useCallback(() => {
    setCashGiven("");
    setKeepChangeAsTip(false);
    setRoundUpTotal("");
    setAdjustmentMode(null);
  }, []);

  const resetCheckoutForm = useCallback(() => {
    const currentLines = linesRef.current;
    setSelectedLineIds(currentLines.map((line) => line.lineId));
    resetPaymentAdjustments();
    setPaymentMethod("card");
    setCashGiven("");
    setLocalError(null);
    setEqualAdjustScope("person");

    const storedEqual = loadEqualSplitSession(tableId);
    const resumeEqual =
      (initialEqualPaymentsMade > 0 &&
        initialEqualSplitCount > initialEqualPaymentsMade) ||
      (storedEqual != null &&
        storedEqual.paymentsMade > 0 &&
        storedEqual.splitCount > storedEqual.paymentsMade);

    if (resumeEqual) {
      const paymentsMade = Math.max(initialEqualPaymentsMade, storedEqual?.paymentsMade ?? 0);
      const count = Math.max(initialEqualSplitCount, storedEqual?.splitCount ?? 0);
      setSplitCountInput(String(count));
      setSplitMode("equal");
      setSplitPhase("checkout");
      setPanelView("split");
      setEqualPaymentsMade(paymentsMade);
      splitSessionRef.current = { active: true, mode: "equal", count };
      clearItemSplitSession(tableId);

      if (storedEqual && storedEqual.splitCount === count) {
        setEqualAdjustScope(storedEqual.equalAdjustScope);
        if (storedEqual.equalAdjustScope === "bill") {
          setDiscountType(storedEqual.discountType);
          setDiscountValue(storedEqual.discountValue);
          setDiscountPreset(storedEqual.discountPreset);
          setTipMode(storedEqual.tipMode);
          setTipPreset(storedEqual.tipPreset);
          setCustomTip(storedEqual.customTip);
        }
      }
      return;
    }

    const storedItems = loadItemSplitSession(tableId);
    if (storedItems?.active) {
      clearEqualSplitSession(tableId);
      setSplitCountInput("2");
      setSplitMode("items");
      setSplitPhase("pick-items");
      setPanelView("split");
      setEqualPaymentsMade(0);
      setSelectedLineIds([]);
      splitSessionRef.current = { active: true, mode: "items", count: 2 };
      return;
    }

    clearEqualSplitSession(tableId);
    clearItemSplitSession(tableId);
    setSplitCountInput("2");
    setSplitMode("total");
    setSplitPhase("checkout");
    setPanelView("main");
    setEqualPaymentsMade(0);
    splitSessionRef.current = { active: false, mode: "total", count: 2 };
  }, [
    resetPaymentAdjustments,
    initialEqualPaymentsMade,
    initialEqualSplitCount,
    tableId,
  ]);

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
    const lineIds = lines.map((line) => line.lineId);

    if (!session.active || session.mode === "total") {
      setSelectedLineIds(lineIds);
      return;
    }

    setSplitMode(session.mode);
    setSplitCountInput(String(session.count));
    setPanelView("split");
    setSplitPhase(session.mode === "items" ? "pick-items" : "checkout");
    if (session.mode === "items") {
      // Keep current picks that still exist; drop paid/removed lines only.
      setSelectedLineIds((prev) => prev.filter((id) => lineIds.includes(id)));
    } else {
      setSelectedLineIds(lineIds);
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

  const handleSplitModeChange = (mode: "equal" | "items") => {
    if (equalPaymentsMade > 0) return;
    setSplitMode(mode);
    if (mode === "equal") {
      clearItemSplitSession(tableId);
      setSelectedLineIds(lines.map((line) => line.lineId));
      setSplitPhase("checkout");
      return;
    }
    persistItemSplitSession(tableId);
    clearEqualSplitSession(tableId);
    setSelectedLineIds([]);
    setSplitPhase("pick-items");
  };

  const exitSplitToMain = () => {
    // Don't abandon an in-progress equal split back to full-bill pay.
    if (equalPaymentsMade > 0 && splitMode === "equal") return;
    clearItemSplitSession(tableId);
    setPanelView("main");
    setSplitMode("total");
    setSplitPhase("checkout");
    setSelectedLineIds(lines.map((line) => line.lineId));
    splitSessionRef.current = { active: false, mode: "total", count: splitCount };
  };

  useEffect(() => {
    if (splitMode === "items") {
      setSelectedLineIds([]);
    } else {
      setSelectedLineIds(linesRef.current.map((line) => line.lineId));
    }
    // Only react to mode changes — refreshing remaining lines must not wipe a mid-pick selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitMode]);

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
        equalAdjustScope,
      }),
    [
      lines,
      discountType,
      discountValue,
      splitMode,
      splitCount,
      selectedLineIds,
      settings.enablePriceRounding,
      equalAdjustScope,
    ],
  );

  const parseAmountField = (raw: string) =>
    raw.trim() === "" ? null : Math.max(0, Number(raw) || 0);

  const cashGivenNum = parseAmountField(cashGiven);
  const roundUpNum = parseAmountField(roundUpTotal);
  const usingCashGiven = cashGivenNum !== null;
  const usingRoundUp = roundUpNum !== null;

  const isEqualSplit = splitMode === "equal" && splitCount > 1;
  const tipPercentBase = baseTotals.tipBase;

  const manualTip =
    tipMode === "preset" && tipPreset !== null
      ? calcTipFromPercent(tipPercentBase, tipPreset)
      : customTip;

  const billAmount = baseTotals.amountDueNow;
  const roundUpTip = usingRoundUp ? Math.max(0, roundUpNum - billAmount) : 0;
  // Bill scope: tip amount is on the full bill (buildCheckoutTotals will divide).
  // Person scope: tip is already for one person.
  const tipAmount = usingRoundUp ? roundUpTip : Math.max(0, manualTip);

  const totals = useMemo(() => {
    if (usingRoundUp) {
      const perPersonTotal = roundUpNum!;
      return {
        ...baseTotals,
        grandTotal: perPersonTotal,
        amountDueNow: perPersonTotal,
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
      equalAdjustScope,
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
    equalAdjustScope,
  ]);

  const chargeTotal = totals.amountDueNow;
  const totalTip = tipAmount;
  const rawChangeDue =
    usingCashGiven && !usingRoundUp ? Math.max(0, cashGivenNum - chargeTotal) : 0;
  const keepAsTipAmount = keepChangeAsTip ? rawChangeDue : 0;
  const changeDueAmount = keepChangeAsTip ? 0 : rawChangeDue;
  const personTipShare =
    isEqualSplit && equalAdjustScope === "bill" && !usingRoundUp
      ? tipAmount / splitCount
      : totalTip;
  const totalTipWithKeep = personTipShare + keepAsTipAmount;
  // Always charge the amount due now (per person when equal-splitting).
  const payTotal = chargeTotal + keepAsTipAmount;
  const insufficientPayment =
    paymentMethod === "cash" &&
    ((usingCashGiven && cashGivenNum < chargeTotal) ||
      (usingRoundUp && roundUpNum < billAmount));

  const splitCheckoutOrders = useMemo(() => {
    if (splitMode === "items") {
      return ordersFromLines(totals.payableLines);
    }
    return orderSummary;
  }, [splitMode, totals.payableLines, orderSummary]);

  const splitCheckoutSummaryRows = useMemo(
    () => buildReceiptLines(splitCheckoutOrders, menuById),
    [splitCheckoutOrders, menuById],
  );

  useEffect(() => {
    if (!onCfdUpdate || !tableLabel) return;

    // Split-by-items: empty selection → show full bill; with selection → selected + total.
    const displayOrders =
      splitMode === "items"
        ? selectedLineIds.length === 0
          ? orderSummary
          : ordersFromLines(totals.payableLines)
        : splitMode === "equal" && splitCount > 1
          ? scaleOrdersForEqualSplit(orderSummary, splitCount)
          : orderSummary;

    const subtotal =
      splitMode === "items" && selectedLineIds.length === 0
        ? orderSummary.reduce((sum, item) => sum + item.price * item.quantity, 0)
        : totals.subtotal;
    const discount =
      splitMode === "items" && selectedLineIds.length === 0 ? 0 : totals.discountAmount;
    const tip =
      splitMode === "items" && selectedLineIds.length === 0 ? 0 : totalTipWithKeep;
    const total =
      splitMode === "items" && selectedLineIds.length === 0 ? subtotal : payTotal;

    onCfdUpdate(
      buildCfdCheckoutPayload(tableLabel, displayOrders, menuItems, {
        subtotal,
        discount,
        tip,
        grandTotal: total,
        amountDueNow: total,
        amountGiven:
          paymentMethod === "cash" &&
          usingCashGiven &&
          !insufficientPayment &&
          !(splitMode === "items" && selectedLineIds.length === 0)
            ? cashGivenNum
            : undefined,
        changeDue:
          paymentMethod === "cash" &&
          usingCashGiven &&
          !usingRoundUp &&
          !insufficientPayment &&
          !(splitMode === "items" && selectedLineIds.length === 0)
            ? changeDueAmount
            : undefined,
        // During active thank-you after a share payment, don't force-interrupt.
        staffInitiated: true,
        deferIfThankYou: panelView === "split",
      }),
    );
  }, [
    onCfdUpdate,
    tableLabel,
    orderSummary,
    menuItems,
    splitMode,
    splitCount,
    selectedLineIds,
    totals.payableLines,
    totals.subtotal,
    totals.discountAmount,
    totals.grandTotal,
    totals.amountDueNow,
    totalTipWithKeep,
    keepChangeAsTip,
    keepAsTipAmount,
    payTotal,
    changeDueAmount,
    paymentMethod,
    usingCashGiven,
    usingRoundUp,
    insufficientPayment,
    cashGivenNum,
    panelView,
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

  const handleCheckout = async (method: PaymentMethod = paymentMethod) => {
    setLocalError(null);
    setPaymentMethod(method);

    if (lines.length === 0) {
      setLocalError(translate("nothingToCheckout"));
      return;
    }

    if (splitMode === "items" && totals.payableLines.length === 0) {
      setLocalError(translate("selectItemsToPay"));
      return;
    }

    if (method === "cash" && insufficientPayment) {
      setLocalError(translate("insufficientCash"));
      return;
    }

    const isEqualSplit = splitMode === "equal" && splitCount > 1;
    const mergedOrders = mergeCheckoutLines(totals.payableLines);
    const paidOrders = isEqualSplit
      ? scaleOrdersForEqualSplit(mergedOrders, splitCount)
      : mergedOrders;
    const remaining = splitMode === "items" ? remainingLines(lines, selectedLineIds) : undefined;

    const shareTip = totalTipWithKeep;

    const payment = {
      paymentMethod: method,
      subtotal: totals.subtotal,
      discountType,
      discountValue,
      discountAmount: totals.discountAmount,
      tip: shareTip,
      grandTotal: chargeTotal + keepAsTipAmount,
      amountDueNow: chargeTotal,
      amountGiven:
        method === "cash" && usingCashGiven
          ? cashGivenNum
          : usingRoundUp
            ? roundUpNum
            : undefined,
      changeDue:
        method === "cash" && usingCashGiven && !usingRoundUp
          ? changeDueAmount
          : usingRoundUp
            ? 0
            : undefined,
      tipFromChange:
        usingRoundUp && roundUpTip > 0
          ? roundUpTip
          : keepAsTipAmount > 0
            ? keepAsTipAmount
            : undefined,
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
      setSplitCountInput(String(count));
      setPanelView("split");
      setSplitPhase(mode === "items" ? "pick-items" : "checkout");
      clearCashOnly();

      if (mode === "equal") {
        clearItemSplitSession(tableId);
        const nextMade = equalPaymentsMade + 1;
        setEqualPaymentsMade(nextMade);
        // Keep bill-scoped tip/discount for every guest; reset only per-person mode.
        if (equalAdjustScope === "person") {
          resetPaymentAdjustments();
        }
        persistEqualSplitSession(tableId, {
          splitCount: count,
          paymentsMade: nextMade,
          equalAdjustScope,
          discountType,
          discountValue,
          discountPreset,
          tipMode,
          tipPreset,
          customTip: equalAdjustScope === "person" ? 0 : customTip,
        });
      } else {
        persistItemSplitSession(tableId);
        resetPaymentAdjustments();
        setSelectedLineIds([]);
      }
    } else if (payload.closeTable) {
      clearEqualSplitSession(tableId);
      clearItemSplitSession(tableId);
    }
  };

  const numericFieldProps = {
    floatingKeyboard: true,
    hideKeyboardToggle: true,
    openOnFocus: true,
  } as const;

  const toggleCalculator = () => setCalculatorOpen((open) => !open);

  const toggleAdjustmentMode = (mode: "tip" | "discount") => {
    setAdjustmentMode((current) => (current === mode ? null : mode));
  };

  const splitActive = splitMode !== "total";
  const inSplitLayout = panelView === "split";
  const inSplitItemPicker = inSplitLayout && splitMode === "items" && splitPhase === "pick-items";
  const inSplitCheckout = inSplitLayout && !inSplitItemPicker;
  const discountActive = totals.discountAmount > 0;
  const tipActive = totalTipWithKeep > 0;

  const optionButtonClass = (active: boolean) =>
    `min-h-[52px] flex-1 rounded-xl border px-3 py-3 text-base font-semibold transition-colors sm:min-h-[56px] sm:text-lg ${
      active
        ? "border-blue-400 bg-blue-50 text-blue-900 dark:border-blue-600 dark:bg-blue-950/40 dark:text-blue-100"
        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
    }`;

  const togglePanel = (panel: CheckoutPanelView) => {
    if (panel === "split") {
      if (panelView === "split") {
        exitSplitToMain();
        return;
      }
      setSplitMode("items");
      setSelectedLineIds([]);
      setSplitPhase("pick-items");
      setPanelView("split");
      splitSessionRef.current = { active: true, mode: "items", count: splitCount };
      persistItemSplitSession(tableId);
      clearEqualSplitSession(tableId);
      return;
    }
  };

  const splitModePicker = (
    <div className="grid grid-cols-2 gap-2">
      {(
        [
          ["equal", translate("splitEqually")],
          ["items", translate("payByItem")],
        ] as const
      ).map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          onClick={() => handleSplitModeChange(mode)}
          className={`min-h-[48px] rounded-xl px-4 py-2.5 text-base font-semibold sm:min-h-[52px] ${filterButtonClass(splitMode === mode)}`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const splitItemPickerColumns = (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
      <div className="flex min-h-0 flex-col rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <p className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {translate("remainingItems")}
          </p>
          {remainingBillLines.length > 0 && (
            <button
              type="button"
              onClick={moveAllToBill}
              className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:border-blue-400 hover:bg-blue-50 dark:border-gray-600 dark:bg-gray-800 dark:text-blue-300"
            >
              {translate("splitMoveAllToBill")}
            </button>
          )}
        </div>
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {remainingBillLines.length === 0 ? (
            <li className="py-12 text-center text-sm text-gray-400">—</li>
          ) : (
            remainingBillLines.map((line) => (
              <li key={line.lineId}>
                <button
                  type="button"
                  onClick={() => moveToBill(line.lineId)}
                  className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left hover:border-blue-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-blue-600"
                >
                  <span className="min-w-0 flex-1 font-medium text-gray-900 dark:text-gray-100">{line.name}</span>
                  <span className="shrink-0 tabular-nums font-semibold text-gray-600">{displayPrice(lineTotal(line))}</span>
                  <ArrowRight className="h-5 w-5 shrink-0 text-blue-600" />
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="flex min-h-0 flex-col rounded-xl border-2 border-blue-300 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-blue-200 px-4 py-3 dark:border-blue-900">
          <p className="text-sm font-bold uppercase tracking-wide text-blue-800 dark:text-blue-200">
            {translate("currentBill")}
          </p>
          {currentBillLines.length > 0 && (
            <button
              type="button"
              onClick={moveAllToRemaining}
              className="shrink-0 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-400 dark:border-blue-800 dark:bg-gray-900 dark:text-gray-200"
            >
              {translate("splitMoveAllToRemaining")}
            </button>
          )}
        </div>
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {currentBillLines.length === 0 ? (
            <li className="py-12 text-center text-sm text-gray-500">{translate("selectItemsToPay")}</li>
          ) : (
            currentBillLines.map((line) => (
              <li key={line.lineId}>
                <button
                  type="button"
                  onClick={() => moveToRemaining(line.lineId)}
                  className="flex w-full items-center gap-3 rounded-xl border border-blue-200 bg-white px-4 py-3 text-left dark:border-blue-900 dark:bg-gray-900"
                >
                  <ArrowLeft className="h-5 w-5 shrink-0 text-gray-400" />
                  <span className="min-w-0 flex-1 font-medium text-gray-900 dark:text-gray-100">{line.name}</span>
                  <span className="shrink-0 tabular-nums font-semibold text-gray-600">{displayPrice(lineTotal(line))}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );

  const equalSplitControls = splitMode === "equal" && (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-900/40 sm:text-base">
      <div className="flex flex-wrap items-center gap-3">
        <label className="font-medium text-gray-600 dark:text-gray-300">{translate("splitCount")}</label>
        <NumericInputField
          value={splitCountInput}
          onChange={(raw) => {
            if (equalPaymentsMade > 0) return;
            const digits = raw.replace(/\D/g, "");
            if (digits === "") {
              setSplitCountInput("");
              return;
            }
            const parsed = Number(digits);
            setSplitCountInput(String(Math.min(20, parsed)));
          }}
          allowDecimal={false}
          inputClassName="w-20 rounded-lg border border-gray-200 px-3 py-2 text-base text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          {...numericFieldProps}
        />
        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
          {translate("perPerson")}: {displayPrice(totals.amountDueNow)}
        </span>
        {splitCount > 1 && (
          <span className="font-semibold text-blue-700 dark:text-blue-300">
            {translate("splitPaymentProgress")
              .replace("{current}", String(equalPaymentsMade + 1))
              .replace("{total}", String(splitCount))}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(
          [
            ["person", translate("equalAdjustScopePerson")],
            ["bill", translate("equalAdjustScopeBill")],
          ] as const
        ).map(([scope, label]) => (
          <button
            key={scope}
            type="button"
            disabled={equalPaymentsMade > 0}
            onClick={() => setEqualAdjustScope(scope)}
            className={`min-h-[44px] rounded-xl px-3 py-2 text-left text-sm font-semibold disabled:opacity-60 ${filterButtonClass(equalAdjustScope === scope)}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{translate("equalAdjustScopeHint")}</p>
    </div>
  );

  const renderOrderSummaryAside = (
    rows: typeof summaryRows,
    header: string,
    totalsBlock: {
      subtotal: number;
      discountAmount: number;
      grandTotal: number;
    },
  ) => (
    <aside className="flex min-h-0 w-full flex-col border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950/20 lg:w-1/2 lg:border-b-0 lg:border-r">
      <div className="shrink-0 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
        <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{header}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] gap-x-3 border-b border-gray-300 pb-2 text-xs font-bold uppercase tracking-wide text-gray-500 dark:border-gray-600 dark:text-gray-400 sm:grid-cols-[minmax(0,1fr)_6rem_6rem] sm:text-sm">
          <span>{translate("itemName")}</span>
          <span className="text-right">{translate("price")}</span>
          <span className="text-right">{translate("total")}</span>
        </div>
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {rows.map((row, index) => (
            <li
              key={`${row.code}-${index}`}
              className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] gap-x-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_6rem_6rem] sm:text-base"
            >
              <span className="min-w-0 font-medium text-gray-900 dark:text-gray-100">
                {row.name}
                {row.quantity > 1 ? ` ×${row.quantity}` : ""}
              </span>
              <span className="text-right tabular-nums text-gray-600 dark:text-gray-300">
                {displayCzkOnly(row.unitPrice)}
              </span>
              <span className="text-right tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                {displayCzkOnly(row.lineTotal)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 space-y-2 border-t border-gray-300 pt-4 dark:border-gray-600">
          <div className="flex items-start justify-between gap-3">
            <span className="text-base font-semibold text-gray-700 dark:text-gray-300">
              {translate("subtotal")}
            </span>
            <div className="text-right">
              <p className="text-base font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {displayCzkOnly(totalsBlock.subtotal)}
              </p>
              {eurSecondary(totalsBlock.subtotal) && (
                <p className="text-sm tabular-nums text-gray-500 dark:text-gray-400">
                  {eurSecondary(totalsBlock.subtotal)}
                </p>
              )}
            </div>
          </div>
          {discountActive && (
            <div className="flex items-center justify-between gap-3 text-orange-700 dark:text-orange-400">
              <span>{translate("discount")}</span>
              <span className="tabular-nums">−{displayCzkOnly(totalsBlock.discountAmount)}</span>
            </div>
          )}
          {tipActive && (
            <div className="flex items-center justify-between gap-3 text-emerald-700 dark:text-emerald-400">
              <span>{translate("tip")}</span>
              <span className="tabular-nums">{displayCzkOnly(totalTipWithKeep)}</span>
            </div>
          )}
          <div className="flex items-start justify-between gap-3 border-t border-gray-300 pt-3 dark:border-gray-600">
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {translate("grandTotal")}
            </span>
            <div className="text-right">
              <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {displayCzkOnly(totalsBlock.grandTotal + keepAsTipAmount)}
              </p>
              {eurSecondary(totalsBlock.grandTotal + keepAsTipAmount) && (
                <p className="text-sm tabular-nums text-gray-500 dark:text-gray-400">
                  {eurSecondary(totalsBlock.grandTotal + keepAsTipAmount)}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );

  const mainPaymentPanel = (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => togglePanel("split")} className={optionButtonClass(splitActive)}>
          ✂️ {translate("splitBill")}
        </button>
        <button type="button" onClick={toggleCalculator} className={optionButtonClass(calculatorOpen)}>
          <span className="inline-flex items-center justify-center gap-2">
            <Calculator className="h-5 w-5" />
            {translate("calculator")}
          </span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => toggleAdjustmentMode("tip")}
          className={optionButtonClass(adjustmentMode === "tip")}
        >
          💡 {translate("tip")}
        </button>
        <button
          type="button"
          onClick={() => toggleAdjustmentMode("discount")}
          className={optionButtonClass(adjustmentMode === "discount")}
        >
          🏷️ {translate("discount")}
        </button>
      </div>

      {adjustmentMode === "discount" && (
        <div className="grid grid-cols-2 gap-2">
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
              className={`min-h-[44px] rounded-xl text-sm font-semibold sm:min-h-[48px] sm:text-base ${
                discountType === type
                  ? "bg-orange-600 text-white"
                  : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {(adjustmentMode === "tip" ||
        (adjustmentMode === "discount" && discountType === "percent")) && (
        <PercentPresetButtons
          presets={CHECKOUT_PERCENT_PRESETS}
          selected={
            adjustmentMode === "tip"
              ? !usingRoundUp && tipMode === "preset"
                ? tipPreset
                : null
              : discountPreset
          }
          onSelect={adjustmentMode === "tip" ? handleTipPreset : handleDiscountPreset}
          activeClassName={
            adjustmentMode === "discount" ? "bg-orange-600 text-white" : "bg-blue-600 text-white"
          }
        />
      )}

      {inSplitCheckout && equalSplitControls}

      {adjustmentMode && (
        <label className="block">
          <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
            {translate("customAmount")}
          </span>
          <NumericInputField
            ref={customAmountRef}
            value={adjustmentMode === "tip" ? customTipDisplay : discountValueDisplay}
            onChange={(raw) => {
              if (adjustmentMode === "tip") {
                handleCustomTipChange(raw);
                return;
              }
              if (discountType === "percent") {
                handleDiscountValueChange(raw);
                return;
              }
              setDiscountPreset(null);
              setDiscountValue(Math.max(0, Number(raw) || 0));
            }}
            allowDecimal={adjustmentMode === "tip" ? false : discountType !== "percent"}
            placeholder={
              adjustmentMode === "tip" ? "0 Kč" : discountType === "percent" ? "0 %" : "0 Kč"
            }
            className="mt-1.5"
            inputClassName="pos-input min-h-[52px] text-lg font-semibold tabular-nums"
            {...numericFieldProps}
          />
        </label>
      )}

      <label className="block">
        <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
          {translate("amountGiven")}
        </span>
        <NumericInputField
          ref={cashGivenRef}
          id="checkout-cash-given-main"
          value={cashGiven}
          onChange={handleCashGivenChange}
          allowDecimal={false}
          placeholder={displayPrice(chargeTotal)}
          className={`mt-1.5 ${insufficientPayment && usingCashGiven ? "[&_input]:border-red-400 dark:[&_input]:border-red-600" : ""}`}
          inputClassName="pos-input min-h-[52px] text-lg font-semibold tabular-nums"
          {...numericFieldProps}
        />
      </label>

      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={keepChangeAsTip}
          onChange={(event) => setKeepChangeAsTip(event.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        {translate("keepAsTip")}
      </label>

      {usingCashGiven && !insufficientPayment && rawChangeDue > 0 && !keepChangeAsTip && (
        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
          → {translate("changeDue")}: {displayPrice(rawChangeDue)}
        </p>
      )}

      {keepChangeAsTip && keepAsTipAmount > 0 && (
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          + {translate("tip")}: {displayPrice(keepAsTipAmount)}
        </p>
      )}

      {insufficientPayment && usingCashGiven && (
        <p className="text-sm font-medium text-red-600 dark:text-red-400">
          {translate("insufficientCash")}
        </p>
      )}

      <div className="rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3 dark:border-blue-900 dark:bg-blue-950/30">
        <SummaryRow
          large
          emphasize
          label={translate("amountDueNow")}
          value={displayPrice(payTotal)}
          highlight
        />
      </div>
    </div>
  );

  const handlePrintProvisionalBill = () => {
    if (!tableLabel || orderSummary.length === 0) return;

    // Guest bill = full table bill. Keep tip only when it applies to the whole bill.
    const provisionalTip =
      splitMode === "equal" && equalAdjustScope === "person" ? 0 : tipAmount;
    const provisionalTotals = buildCheckoutTotals({
      lines: orderSummary,
      discountType,
      discountValue,
      tip: provisionalTip,
      splitMode: "total",
      splitCount: 1,
      enablePriceRounding: settings.enablePriceRounding,
    });

    printProvisionalBill({
      tableLabel,
      staffName: staff?.name,
      orders: orderSummary,
      menuItems,
      payment: {
        paymentMethod: "cash",
        subtotal: provisionalTotals.subtotal,
        discountType,
        discountValue,
        discountAmount: provisionalTotals.discountAmount,
        tip: provisionalTip,
        grandTotal: provisionalTotals.grandTotal,
        amountDueNow: provisionalTotals.grandTotal,
        splitMode: "total",
        splitCount: 1,
      },
    });
  };

  const splitItemsSelected = splitMode !== "items" || selectedLineIds.length > 0;

  const mainPaymentFooter = (
    <div className="shrink-0 space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
      <button
        type="button"
        disabled={isSaving || orderSummary.length === 0}
        onClick={handlePrintProvisionalBill}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-800 shadow-sm disabled:opacity-40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 sm:text-base"
      >
        <Printer className="h-4 w-4 shrink-0" />
        {translate("printProvisionalBill")}
      </button>
      <p className="-mt-1 text-xs text-gray-500 dark:text-gray-400">
        {translate("printProvisionalBillHint")}
      </p>
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
        <Printer className="h-4 w-4 shrink-0 text-gray-500" />
        {translate("checkoutPrintReceipt")}
        <input
          type="checkbox"
          checked={printReceipt}
          onChange={(event) => setPrintReceipt(event.target.checked)}
          className="ml-auto h-4 w-4 rounded border-gray-300"
        />
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={isSaving || lines.length === 0 || !splitItemsSelected}
          onClick={() => void handleCheckout("card")}
          className="min-h-[56px] rounded-xl bg-blue-600 px-3 py-3 text-base font-bold text-white shadow-sm disabled:opacity-40 sm:min-h-[60px] sm:text-lg"
        >
          {isSaving ? "..." : `${translate("payByCard")} — ${displayPrice(payTotal)}`}
        </button>
        <button
          type="button"
          disabled={
            isSaving ||
            lines.length === 0 ||
            !splitItemsSelected ||
            (usingCashGiven && insufficientPayment)
          }
          onClick={() => void handleCheckout("cash")}
          className="min-h-[56px] rounded-xl bg-emerald-600 px-3 py-3 text-base font-bold text-white shadow-sm disabled:opacity-40 sm:min-h-[60px] sm:text-lg"
        >
          {isSaving ? "..." : `${translate("payInCash")} — ${displayPrice(payTotal)}`}
        </button>
      </div>
    </div>
  );

  const splitItemPickerScreen = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={exitSplitToMain}
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4 sm:px-6">
        {splitItemPickerColumns}
      </div>
      <div className="shrink-0 border-t border-gray-200 px-5 py-4 dark:border-gray-700 sm:px-6">
        <button
          type="button"
          disabled={currentBillLines.length === 0}
          onClick={() => {
            setLocalError(null);
            if (currentBillLines.length === 0) {
              setLocalError(translate("selectItemsToPay"));
              return;
            }
            setSplitPhase("checkout");
          }}
          className="min-h-[56px] w-full rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white shadow-sm disabled:opacity-40 sm:min-h-[60px] sm:text-lg"
        >
          {translate("proceedToCheckout")}
          {currentBillLines.length > 0
            ? ` · ${displayPrice(totals.amountDueNow)}`
            : ""}
        </button>
      </div>
    </div>
  );

  const paymentCheckoutLayout = (
    rows: typeof summaryRows,
    header: string,
    onBack?: () => void,
    backLabel?: string,
  ) => (
    <div className="flex min-h-0 flex-1 flex-col">
      {onBack && (
        <div className="shrink-0 border-b border-gray-200 px-5 py-3 dark:border-gray-700 lg:hidden">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-300"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel ?? translate("backToOrder")}
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {renderOrderSummaryAside(rows, header, {
          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          grandTotal: totals.grandTotal,
        })}
        <div className="flex min-h-0 w-full flex-col lg:w-1/2">
          {onBack && (
            <div className="hidden shrink-0 border-b border-gray-200 px-5 py-3 dark:border-gray-700 lg:block">
              <button
                type="button"
                onClick={onBack}
                className="flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-300"
              >
                <ArrowLeft className="h-4 w-4" />
                {backLabel ?? translate("backToOrder")}
              </button>
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col px-5 py-4 sm:px-6">
            {mainPaymentPanel}
          </div>
          <div className="px-5 pb-4 sm:px-6">{mainPaymentFooter}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`flex min-h-0 flex-1 flex-col bg-inherit text-gray-800 dark:text-gray-200 ${className}`}>
      {localError && (
        <p className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {localError}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {inSplitItemPicker ? (
          splitItemPickerScreen
        ) : inSplitCheckout ? (
          paymentCheckoutLayout(
            splitCheckoutSummaryRows,
            `${translate("payment")}${tableLabel ? ` — ${translate("table")} ${tableLabel}` : ""}${
              splitMode === "equal" ? ` · ${translate("splitEqually")}` : ` · ${translate("payByItem")}`
            }`,
            splitMode === "items"
              ? () => setSplitPhase("pick-items")
              : exitSplitToMain,
            splitMode === "items" ? translate("payByItem") : translate("payment"),
          )
        ) : (
          paymentCheckoutLayout(
            summaryRows,
            tableLabel
              ? `${translate("payment")} — ${translate("table")} ${tableLabel}`
              : translate("payment"),
          )
        )}
      </div>
      <FloatingCalculator open={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
    </div>
  );
}

export type { CheckoutLine, CheckoutSubmitPayload };
