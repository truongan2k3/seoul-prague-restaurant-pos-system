"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { CheckoutPanel, type CheckoutSubmitPayload } from "@/components/checkout-panel";
import { useApp } from "@/contexts/app-context";
import { expandCheckoutLines } from "@/lib/checkout-calculations";
import {
  buildCfdCheckoutPayload,
  sendCfdEvent,
  type CfdCheckoutPayload,
} from "@/lib/cfd-display";
import type { MenuItem, OrderItem, RestaurantTable } from "@/lib/types";

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

  useEffect(() => {
    if (open) setCheckoutSessionKey((key) => key + 1);
  }, [open, table.id]);

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
    if (!open) return;
    const subtotal = orders.reduce((sum, item) => sum + item.price * item.quantity, 0);
    void sendCfdEvent(
      "START_CHECKOUT",
      buildCfdCheckoutPayload(table.label, orders, menuItems, {
        subtotal,
        discount: 0,
        tip: 0,
        grandTotal: subtotal,
        amountDueNow: subtotal,
      }),
    );
  }, [open, table.label, orders, menuItems]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, handleClose]);

  if (!open) return null;

  const title = `${translate("payment")} — ${translate("table")} ${table.label}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-modal-title"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={handleClose}
        className="absolute inset-0 bg-black/60"
      />

      <div className="relative z-10 my-auto flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
        <header className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-inherit px-3 py-3 sm:gap-3 sm:px-4 dark:border-gray-700">
          <button
            type="button"
            onClick={handleBack}
            disabled={isSaving}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-700"
            aria-label={translate("backToOrder")}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2
            id="payment-modal-title"
            className="min-w-0 flex-1 truncate text-base font-semibold text-gray-900 sm:text-lg dark:text-gray-100"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSaving}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {error && (
          <p className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <CheckoutPanel
          className="min-h-0 flex-1"
          lines={lines}
          orderSummary={orders}
          menuItems={menuItems}
          tableLabel={table.label}
          isSaving={isSaving}
          onCheckout={onConfirm}
          onCfdUpdate={broadcastCheckoutUpdate}
          confirmLabel={translate("confirmPrintReceipt")}
          sessionResetKey={checkoutSessionKey}
        />
      </div>
    </div>
  );
}
