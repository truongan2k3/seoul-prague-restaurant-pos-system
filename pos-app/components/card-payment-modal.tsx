"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { formatCzk } from "@/lib/checkout-calculations";
import type { TerminalConfig } from "@/src/lib/terminalApi";
import {
  processTerminalPayment,
  TerminalPaymentCancelledError,
  TerminalPaymentDeclinedError,
  TerminalPaymentTimeoutError,
  type TerminalPaymentResponse,
} from "@/src/lib/terminalApi";

export type CardPaymentModalPhase = "processing" | "success" | "declined" | "timeout" | "error";

interface CardPaymentModalProps {
  open: boolean;
  amount: number;
  terminalConfig: TerminalConfig;
  onApproved: (result: TerminalPaymentResponse) => void;
  onCancel: () => void;
  onManualOverride: () => void;
}

export function CardPaymentModal({
  open,
  amount,
  terminalConfig,
  onApproved,
  onCancel,
  onManualOverride,
}: CardPaymentModalProps) {
  const { translate } = useApp();
  const [phase, setPhase] = useState<CardPaymentModalPhase>("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const approvedRef = useRef(false);

  const runPayment = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    approvedRef.current = false;
    setPhase("processing");
    setErrorMessage(null);

    try {
      const result = await processTerminalPayment(
        { amount, currency: "CZK" },
        terminalConfig,
        controller.signal,
      );

      if (result.status === "APPROVED") {
        approvedRef.current = true;
        setPhase("success");
        window.setTimeout(() => {
          onApproved(result);
        }, 1400);
      }
    } catch (error) {
      if (error instanceof TerminalPaymentCancelledError) {
        return;
      }
      if (error instanceof TerminalPaymentDeclinedError) {
        setPhase("declined");
        setErrorMessage(error.response.message ?? translate("cardPaymentDeclined"));
        return;
      }
      if (error instanceof TerminalPaymentTimeoutError) {
        setPhase("timeout");
        setErrorMessage(translate("cardPaymentTimeout"));
        return;
      }
      setPhase("error");
      setErrorMessage(error instanceof Error ? error.message : translate("cardPaymentError"));
    }
  }, [amount, onApproved, terminalConfig, translate]);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setPhase("processing");
      setErrorMessage(null);
      approvedRef.current = false;
      return;
    }

    void runPayment();

    return () => {
      if (!approvedRef.current) {
        abortRef.current?.abort();
      }
    };
  }, [open, runPayment]);

  const handleCancel = () => {
    abortRef.current?.abort();
    onCancel();
  };

  if (!open) return null;

  const showFailureActions = phase === "declined" || phase === "timeout" || phase === "error";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-payment-title"
    >
      <div className="absolute inset-0 bg-black/70" />

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="border-b border-gray-100 px-6 py-5 text-center dark:border-gray-800">
          {phase === "processing" && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/40">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
              </div>
              <h2 id="card-payment-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {translate("cardPaymentProcessing")}
              </h2>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {translate("cardPaymentTapHint")}
              </p>
            </>
          )}

          {phase === "success" && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40">
                <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 id="card-payment-title" className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">
                {translate("cardPaymentSuccess")}
              </h2>
            </>
          )}

          {showFailureActions && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/40">
                <AlertCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
              </div>
              <h2 id="card-payment-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {phase === "timeout"
                  ? translate("cardPaymentTimeoutTitle")
                  : translate("cardPaymentFailedTitle")}
              </h2>
              {errorMessage && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center dark:border-gray-700 dark:bg-gray-800/60">
            <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <CreditCard className="h-4 w-4" />
              {translate("amountDueNow")}
            </div>
            <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
              {formatCzk(amount)}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-gray-100 px-6 py-4 dark:border-gray-800">
          {phase === "processing" && (
            <button
              type="button"
              onClick={handleCancel}
              className="min-h-[44px] rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-800 dark:border-gray-600 dark:text-gray-200"
            >
              {translate("cardPaymentCancel")}
            </button>
          )}

          {showFailureActions && (
            <>
              <button
                type="button"
                onClick={handleCancel}
                className="min-h-[44px] rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-800 dark:border-gray-600 dark:text-gray-200"
              >
                {translate("cardPaymentCancel")}
              </button>
              <button
                type="button"
                onClick={onManualOverride}
                className="min-h-[44px] rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
              >
                {translate("cardPaymentManualOverride")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
