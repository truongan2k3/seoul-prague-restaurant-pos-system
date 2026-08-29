"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { CheckoutPanel, type CheckoutSubmitPayload } from "@/components/checkout-panel";
import { ModalOverlay, ModalPanel } from "@/components/modal-overlay";
import { useApp } from "@/contexts/app-context";
import { expandCheckoutLines } from "@/lib/checkout-calculations";
import {
  buildCfdCheckoutPayload,
  sendCfdEvent,
  type CfdCheckoutPayload,
} from "@/lib/cfd-display";
import type { MenuItem, OrderItem, RestaurantTable } from "@/lib/types";
import { fetchEqualSplitProgress } from "@/src/lib/sales-actions";

interface PaymentModalProps {
  open: boolean;
  table: RestaurantTable;
  orders: OrderItem[];
  menuItems: MenuItem[];
  onClose: () => void;
  onBack: () => void;
  onConfirm: (payload: CheckoutSubmitPayload) => void | Promise<void>;
  isSaving?: boolean;
  error?: string | null;
}

export function PaymentModal({
  open,
  table,
  orders,
  menuItems,
  onClose,
  onBack,
  onConfirm,
  isSaving = false,
  error,
}: PaymentModalProps) {
  const { translate } = useApp();

  const lines = useMemo(() => expandCheckoutLines(orders), [orders]);
  const [checkoutSessionKey, setCheckoutSessionKey] = useState(0);
  const [equalProgress, setEqualProgress] = useState({ paymentsMade: 0, splitCount: 0 });
  const [progressReady, setProgressReady] = useState(false);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setProgressReady(false);
      setEqualProgress({ paymentsMade: 0, splitCount: 0 });
      return;
    }

    let cancelled = false;
    setProgressReady(false);
    void fetchEqualSplitProgress(table.id, table.occupiedAt).then((result) => {
      if (cancelled) return;
      setEqualProgress({
        paymentsMade: result.paymentsMade,
        splitCount: result.splitCount,
      });
      setCheckoutSessionKey((key) => key + 1);
      setProgressReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [open, table.id, table.occupiedAt]);

  const handleCancelCfd = useCallback(() => {
    void sendCfdEvent("CANCEL_CHECKOUT", {});
  }, []);

  const handleClose = useCallback(() => {
    handleCancelCfd();
    onClose();
  }, [handleCancelCfd, onClose]);

  const handleBack = useCallback(() => {
    handleCancelCfd();
    onBack();
  }, [handleCancelCfd, onBack]);

  const broadcastCheckoutUpdate = useCallback((payload: CfdCheckoutPayload) => {
    void sendCfdEvent("START_CHECKOUT", payload);
  }, []);

  useEffect(() => {
    if (!open || !progressReady) {
      wasOpenRef.current = false;
      return;
    }
    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;
    if (!justOpened) return;

    // Initial CFD: if resuming equal split, show one person's share; else full bill.
    const fullSubtotal = orders.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const resuming =
      equalProgress.paymentsMade > 0 &&
      equalProgress.splitCount > equalProgress.paymentsMade;
    const shareCount = resuming ? equalProgress.splitCount : 1;
    const amount = shareCount > 1 ? fullSubtotal / shareCount : fullSubtotal;

    void sendCfdEvent(
      "START_CHECKOUT",
      buildCfdCheckoutPayload(table.label, orders, menuItems, {
        subtotal: amount,
        discount: 0,
        tip: 0,
        grandTotal: amount,
        amountDueNow: amount,
        staffInitiated: true,
      }),
    );
  }, [
    open,
    progressReady,
    table.label,
    orders,
    menuItems,
    equalProgress.paymentsMade,
    equalProgress.splitCount,
  ]);

  const title = `${translate("payment")} — ${translate("table")} ${table.label}`;

  return (
    <ModalOverlay
      open={open}
      onClose={handleClose}
      showBackdrop={false}
      className="flex flex-col"
      ariaLabelledBy="payment-modal-title"
    >
      <ModalPanel className="flex h-full w-full flex-col bg-white dark:bg-gray-900">
      <header className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-inherit px-4 py-4 sm:px-6 dark:border-gray-700">
        <button
          type="button"
          onClick={handleBack}
          disabled={isSaving}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-800"
          aria-label={translate("backToOrder")}
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h2
          id="payment-modal-title"
          className="min-w-0 flex-1 truncate text-xl font-bold text-gray-900 sm:text-2xl dark:text-gray-100"
        >
          {title}
        </h2>
        <button
          type="button"
          onClick={handleClose}
          disabled={isSaving}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          aria-label="Close"
        >
          <X className="h-6 w-6" />
        </button>
      </header>

      {error && (
        <p className="shrink-0 border-b border-red-200 bg-red-50 px-6 py-3 text-base text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {progressReady ? (
        <CheckoutPanel
          className="min-h-0 flex-1"
          lines={lines}
          orderSummary={orders}
          menuItems={menuItems}
          tableLabel={table.label}
          tableId={table.id}
          isSaving={isSaving}
          onCheckout={onConfirm}
          onCfdUpdate={broadcastCheckoutUpdate}
          confirmLabel={translate("confirmPrintReceipt")}
          sessionResetKey={checkoutSessionKey}
          initialEqualPaymentsMade={equalProgress.paymentsMade}
          initialEqualSplitCount={equalProgress.splitCount}
        />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-gray-500">
          …
        </div>
      )}
      </ModalPanel>
    </ModalOverlay>
  );
}
