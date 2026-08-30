"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Printer, Trash2, X } from "lucide-react";
import { ModalOverlay, ModalPanel } from "@/components/modal-overlay";
import { usePinGate } from "@/contexts/pin-gate-context";
import { NumericInputField } from "@/components/numeric-input-field";
import { useApp } from "@/contexts/app-context";
import { useNotifications } from "@/contexts/notification-context";
import { useReceiptPrint } from "@/contexts/receipt-print-context";
import { canManageStaff } from "@/lib/staff-roles";
import type { CheckoutPaymentRecord } from "@/lib/checkout-calculations";
import { formatCzk } from "@/lib/currency";
import {
  formatHistoryActivityLine,
  historyActivityLogLabelKey,
  isHistoryAlertAction,
  saleHasHistoryAlert,
} from "@/lib/order-activity";
import { generateOrderNumber } from "@/lib/receipt-calculations";
import { paymentFilterClass } from "@/lib/theme-classes";
import type { MenuItem, PaymentMethod, SaleRecord } from "@/lib/types";
import { formatHistoryDateTime, resolveGuestSeatedAt } from "@/lib/sale-history";
import { resolveTipPaymentMethod } from "@/lib/summary-analytics";
import { updateSaleTipRecord } from "@/src/lib/sale-tip-actions";
import { deleteSaleRecords } from "@/src/lib/sales-actions";
import { mapSalesResponse } from "@/src/lib/supabase-data";

function saleToPaymentRecord(sale: SaleRecord): CheckoutPaymentRecord {
  const isEqualShare =
    sale.splitMode === "equal" && (sale.splitCount ?? 1) > 1;
  return {
    paymentMethod: sale.paymentMethod,
    subtotal: sale.subtotal,
    discountType: "fixed",
    discountValue: sale.discountAmount,
    discountAmount: sale.discountAmount,
    tip: sale.tip,
    grandTotal: sale.grandTotal,
    amountDueNow: sale.grandTotal,
    amountGiven: sale.amountGiven,
    changeDue: sale.changeDue,
    splitMode: isEqualShare ? "total" : (sale.splitMode ?? "total"),
    splitCount: 1,
  };
}

interface OrderHistoryModalProps {
  sale: SaleRecord;
  menuItems: MenuItem[];
  onClose: () => void;
  onUpdated: (sale: SaleRecord) => void;
  onDeleted?: (saleId: string, deletedAt?: Date) => void;
  /** @deprecated use initialEditTip */
  initialEditMode?: boolean;
  initialEditTip?: boolean;
}

export function OrderHistoryModal({
  sale,
  menuItems,
  onClose,
  onUpdated,
  onDeleted,
  initialEditMode = false,
  initialEditTip,
}: OrderHistoryModalProps) {
  const resolvedInitialEditTip = initialEditTip ?? initialEditMode;

  const { translate, currentStaffUser, logAction, language } = useApp();
  const { printReceipt } = useReceiptPrint();
  const { pushNotification } = useNotifications();
  const { requestPin } = usePinGate();
  const [editTipMode, setEditTipMode] = useState(resolvedInitialEditTip);
  const [editTip, setEditTip] = useState(sale.tip);
  const [editTipPaymentMethod, setEditTipPaymentMethod] = useState<PaymentMethod>(
    resolveTipPaymentMethod(sale),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canEditTip = Boolean(currentStaffUser) && !sale.deletedAt;
  const canDelete = canManageStaff(currentStaffUser?.role) && !sale.deletedAt;

  const resetEditState = () => {
    setEditTip(sale.tip);
    setEditTipPaymentMethod(resolveTipPaymentMethod(sale));
    setSaveError(null);
  };

  useEffect(() => {
    setEditTipMode(resolvedInitialEditTip);
    resetEditState();
  }, [sale, resolvedInitialEditTip]);

  const editGrandTotal = useMemo(
    () => Math.max(0, sale.subtotal - sale.discountAmount) + editTip,
    [sale.subtotal, sale.discountAmount, editTip],
  );

  const guestSeatedAt = resolveGuestSeatedAt(sale);

  const handleReprint = () => {
    printReceipt({
      tableLabel: sale.tableLabel,
      staffName: sale.staffName,
      orders: sale.items,
      payment: saleToPaymentRecord(sale),
      menuItems,
      closedAt: sale.closedAt,
    });
  };

  const handleSaveTip = async () => {
    setSaving(true);
    setSaveError(null);

    const { data, error } = await updateSaleTipRecord(sale.id, {
      tip: editTip,
      tipPaymentMethod: editTipPaymentMethod,
    });
    setSaving(false);

    if (error) {
      setSaveError(error.message);
      return;
    }

    if (!data) {
      setSaveError(translate("saveFailed"));
      return;
    }

    const [updated] = mapSalesResponse([data]);
    if (!updated) {
      setSaveError(translate("saveFailed"));
      return;
    }

    onUpdated(updated);
    setEditTipMode(false);
    onClose();

    logAction(
      "edit_sale_tip",
      `Order ${generateOrderNumber(sale.closedAt)} · ${sale.tableLabel} · tip ${sale.tip}→${editTip}`,
    );
  };

  const handleDelete = () => {
    requestPin(async () => {
      const { data, error } = await deleteSaleRecords([sale.id]);
      if (error) {
        pushNotification({ message: translate("historyDeleteFailed") });
        return;
      }
      if (!data?.length) {
        pushNotification({ message: translate("historyDeleteFailed") });
        return;
      }
      logAction("delete_sale", `Deleted sale ${generateOrderNumber(sale.closedAt)} · ${sale.tableLabel}`);
      pushNotification({ message: translate("historyDeleteSuccess") });
      const deletedAt = data[0]?.deleted_at ? new Date(data[0].deleted_at) : new Date();
      onDeleted?.(sale.id, deletedAt);
    }, { force: true });
  };

  const alertEntries = (sale.activityLog ?? []).filter((entry) =>
    isHistoryAlertAction(entry.action),
  );

  return (
    <ModalOverlay
      open
      onClose={onClose}
      className="flex items-center justify-center p-4"
      backdropClassName="bg-black/50"
      ariaLabelledBy="order-history-title"
    >
      <ModalPanel className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <div>
            <h2 id="order-history-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {translate("orderDetails")}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {translate("orderId")}: {generateOrderNumber(sale.closedAt)} · {translate("table")}{" "}
              {sale.tableLabel}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
              <span>
                {translate("historyGuestArrived")}: {formatHistoryDateTime(guestSeatedAt, language)}
              </span>
              <span>
                {translate("historyGuestCheckout")}: {formatHistoryDateTime(sale.closedAt, language)}
              </span>
            </div>
            {sale.deletedAt && (
              <p className="mt-2 inline-flex rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white">
                − {translate("historyDeletedBanner")} · {formatHistoryDateTime(sale.deletedAt, language)}
              </p>
            )}
            {(sale.guestName || sale.visitSource) && (
              <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                {translate("guestInfo")}: {sale.guestName}
                {sale.partySize ? ` · ${sale.partySize} pax` : ""}
                {sale.visitSource
                  ? ` · ${translate(sale.visitSource === "walk_in" ? "resSourceWalkIn" : "resSourceReservation")}`
                  : ""}
                {sale.guestPhone ? ` · ${sale.guestPhone}` : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label={translate("cancel")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {translate("currentOrder")}
            </h3>
            <ul className="mt-3 space-y-2">
              {sale.items.map((item, index) => (
                <li
                  key={item.id ?? `${item.name}-${index}`}
                  className="rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/60"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      {item.quantity}x {item.name}
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatCzk(item.price * item.quantity)}
                    </span>
                  </div>
                  {(item.notes?.trim() || item.notesTranslated?.trim()) && (
                    <p className="mt-1 text-xs italic text-orange-700 dark:text-orange-300">
                      {item.notesTranslated?.trim() || item.notes?.trim()}
                      {item.notesTranslated?.trim() &&
                      item.notes?.trim() &&
                      item.notesTranslated.trim() !== item.notes.trim()
                        ? ` · ${item.notes.trim()}`
                        : ""}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {saleHasHistoryAlert(sale) && (
            <section className="rounded-xl border border-amber-300 bg-amber-50/80 p-4 dark:border-amber-800 dark:bg-amber-950/30">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {translate("historyActivityLogTitle")}
              </h3>
              <ul className="mt-3 space-y-2">
                {alertEntries.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-lg bg-white/70 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
                  >
                    <p className="font-medium">{formatHistoryActivityLine(entry)}</p>
                    <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-200/80">
                      {entry.staffName}
                      {" · "}
                      {formatHistoryDateTime(entry.createdAt, language)}
                      {" · "}
                      {translate(historyActivityLogLabelKey(entry.action))}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
            {editTipMode ? (
              <div className="mb-4 space-y-3 text-sm">
                <label className="block space-y-1">
                  <span>{translate("tip")}</span>
                  <NumericInputField
                    value={editTip > 0 ? String(editTip) : ""}
                    onChange={(raw) => setEditTip(Math.max(0, Number(raw) || 0))}
                    allowDecimal
                    inputClassName="w-full rounded border border-gray-200 px-2 py-1 text-right text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                </label>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">{translate("tipPaymentMethod")}</span>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {translate("tipPaymentMethodHint")}
                  </p>
                  <div className="mt-2 flex gap-2">
                    {(["cash", "card"] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setEditTipPaymentMethod(method)}
                        className={`min-h-[40px] flex-1 rounded-lg px-3 text-sm font-semibold capitalize ${paymentFilterClass(
                          editTipPaymentMethod === method,
                          method,
                        )}`}
                      >
                        {translate(method)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-500 dark:text-gray-400">{translate("paymentMethod")}:</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                    sale.paymentMethod === "cash"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                      : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
                  }`}
                >
                  {translate(sale.paymentMethod)}
                </span>
                {sale.paymentMethod === "cash" && sale.amountGiven != null && (
                  <span className="text-gray-600 dark:text-gray-300">
                    · {translate("amountGiven")} {formatCzk(sale.amountGiven)}
                    {(sale.changeDue ?? 0) > 0
                      ? ` · ${translate("changeDue")} ${formatCzk(sale.changeDue ?? 0)}`
                      : ""}
                  </span>
                )}
              </div>
            )}
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">{translate("subtotal")}</dt>
                <dd className="tabular-nums">{formatCzk(sale.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">{translate("discount")}</dt>
                <dd className="tabular-nums">-{formatCzk(sale.discountAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">{translate("tip")}</dt>
                <dd className="tabular-nums">
                  {formatCzk(editTipMode ? editTip : sale.tip)}
                  {(editTipMode ? editTip : sale.tip) > 0 && (
                    <span className="ml-2 text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                      (
                      {translate(
                        editTipMode ? editTipPaymentMethod : resolveTipPaymentMethod(sale),
                      )}
                      )
                    </span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-semibold dark:border-gray-700">
                <dt>{translate("grandTotal")}</dt>
                <dd className="tabular-nums">
                  {formatCzk(editTipMode ? editGrandTotal : sale.grandTotal)}
                </dd>
              </div>
            </dl>
            {saveError && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">{saveError}</p>
            )}
          </section>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <button
            type="button"
            onClick={handleReprint}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-3 text-base font-semibold text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
          >
            <Printer className="h-5 w-5" />
            {translate("reprintBill")}
          </button>
          {canEditTip && (
            editTipMode ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditTipMode(false);
                    resetEditState();
                  }}
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium dark:border-gray-700"
                >
                  {translate("cancel")}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveTip()}
                  className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {translate("saveChanges")}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditTipMode(true)}
                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200"
              >
                {translate("editTip")}
              </button>
            )
          )}
          {canDelete && !editTipMode && (
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            >
              <Trash2 className="h-4 w-4" />
              {translate("deleteOrder")}
            </button>
          )}
        </div>
      </ModalPanel>
    </ModalOverlay>
  );
}
