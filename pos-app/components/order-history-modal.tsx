"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer, Trash2, X } from "lucide-react";
import { useAdminDeletionGate } from "@/contexts/admin-deletion-gate-context";
import { NumericInputField } from "@/components/numeric-input-field";
import { TableActivityLogPanel } from "@/components/table-activity-log-panel";
import { useApp } from "@/contexts/app-context";
import { useNotifications } from "@/contexts/notification-context";
import { useReceiptPrint } from "@/contexts/receipt-print-context";
import { canManageStaff } from "@/lib/staff-roles";
import { sumLines } from "@/lib/checkout-calculations";
import type { CheckoutPaymentRecord } from "@/lib/checkout-calculations";
import { formatCzk } from "@/lib/currency";
import { generateOrderNumber } from "@/lib/receipt-calculations";
import type { MenuItem, OrderItem, SaleRecord } from "@/lib/types";
import { deleteSaleRecords, updateSaleRecord } from "@/src/lib/sales-actions";

function saleToPaymentRecord(sale: SaleRecord): CheckoutPaymentRecord {
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
    splitMode: sale.splitMode ?? "total",
    splitCount: sale.splitCount ?? 1,
  };
}

interface OrderHistoryModalProps {
  sale: SaleRecord;
  menuItems: MenuItem[];
  onClose: () => void;
  onUpdated: (sale: SaleRecord) => void;
  onDeleted?: (saleId: string) => void;
  initialEditMode?: boolean;
}

export function OrderHistoryModal({
  sale,
  menuItems,
  onClose,
  onUpdated,
  onDeleted,
  initialEditMode = false,
}: OrderHistoryModalProps) {
  const { translate, currentStaffUser, logAction } = useApp();
  const { printReceipt } = useReceiptPrint();
  const { pushNotification } = useNotifications();
  const { requestDeletion } = useAdminDeletionGate();
  const [editMode, setEditMode] = useState(initialEditMode);
  const [editItems, setEditItems] = useState<OrderItem[]>(sale.items);
  const [editDiscount, setEditDiscount] = useState(sale.discountAmount);
  const [editTip, setEditTip] = useState(sale.tip);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canEdit = canManageStaff(currentStaffUser?.role);
  const orderItemIds = useMemo(
    () => sale.items.map((item) => item.id).filter((id): id is string => Boolean(id)),
    [sale.items],
  );
  const itemNameById = useMemo(
    () => new Map(sale.items.filter((item) => item.id).map((item) => [item.id!, item.name])),
    [sale.items],
  );

  useEffect(() => {
    setEditMode(initialEditMode);
    setEditItems(sale.items);
    setEditDiscount(sale.discountAmount);
    setEditTip(sale.tip);
    setSaveError(null);
  }, [sale, initialEditMode]);

  const editSubtotal = useMemo(() => sumLines(editItems), [editItems]);
  const editGrandTotal = useMemo(
    () => Math.max(0, editSubtotal - editDiscount) + editTip,
    [editSubtotal, editDiscount, editTip],
  );

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

  const handleSaveEdit = async () => {
    setSaving(true);
    setSaveError(null);
    const { error } = await updateSaleRecord(sale.id, {
      items: editItems,
      subtotal: editSubtotal,
      discountAmount: editDiscount,
      tip: editTip,
      grandTotal: editGrandTotal,
    });
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }

    const updated: SaleRecord = {
      ...sale,
      items: editItems,
      subtotal: editSubtotal,
      discountAmount: editDiscount,
      tip: editTip,
      grandTotal: editGrandTotal,
    };
    onUpdated(updated);
    setEditMode(false);
    logAction("edit_sale", `Order ${generateOrderNumber(sale.closedAt)} · ${sale.tableLabel}`);
  };

  const handleDelete = () => {
    requestDeletion(async () => {
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
      onDeleted?.(sale.id);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-history-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-gray-900"
      >
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <div>
            <h2 id="order-history-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {translate("orderDetails")}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {translate("orderId")}: {generateOrderNumber(sale.closedAt)} · {translate("table")}{" "}
              {sale.tableLabel}
            </p>
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
            {editMode ? (
              <ul className="mt-3 space-y-2">
                {editItems.map((item, index) => (
                  <li
                    key={item.id ?? `${item.name}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700"
                  >
                    <span className="text-sm">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <label className="sr-only">Quantity</label>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(event) => {
                          const quantity = Math.max(1, Number(event.target.value) || 1);
                          setEditItems((prev) =>
                            prev.map((row, rowIndex) =>
                              rowIndex === index ? { ...row, quantity } : row,
                            ),
                          );
                        }}
                        className="w-16 rounded border border-gray-200 px-2 py-1 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                      />
                      <span className="text-sm tabular-nums text-gray-600 dark:text-gray-300">
                        {formatCzk(item.price * item.quantity)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="mt-3 space-y-2">
                {sale.items.map((item, index) => (
                  <li
                    key={item.id ?? `${item.name}-${index}`}
                    className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/60"
                  >
                    <span>
                      {item.quantity}x {item.name}
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatCzk(item.price * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
            {editMode ? (
              <div className="space-y-3 text-sm">
                <label className="block space-y-1">
                  <span className="flex items-center justify-between gap-3">
                    {translate("discount")}
                  </span>
                  <NumericInputField
                    value={editDiscount > 0 ? String(editDiscount) : ""}
                    onChange={(raw) => setEditDiscount(Math.max(0, Number(raw) || 0))}
                    allowDecimal
                    inputClassName="w-full rounded border border-gray-200 px-2 py-1 text-right text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="flex items-center justify-between gap-3">
                    {translate("tip")}
                  </span>
                  <NumericInputField
                    value={editTip > 0 ? String(editTip) : ""}
                    onChange={(raw) => setEditTip(Math.max(0, Number(raw) || 0))}
                    allowDecimal
                    inputClassName="w-full rounded border border-gray-200 px-2 py-1 text-right text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                </label>
              </div>
            ) : null}
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">{translate("subtotal")}</dt>
                <dd className="tabular-nums">
                  {formatCzk(editMode ? editSubtotal : sale.subtotal)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">{translate("discount")}</dt>
                <dd className="tabular-nums">
                  -{formatCzk(editMode ? editDiscount : sale.discountAmount)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">{translate("tip")}</dt>
                <dd className="tabular-nums">{formatCzk(editMode ? editTip : sale.tip)}</dd>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-semibold dark:border-gray-700">
                <dt>{translate("grandTotal")}</dt>
                <dd className="tabular-nums">
                  {formatCzk(editMode ? editGrandTotal : sale.grandTotal)}
                </dd>
              </div>
            </dl>
            {saveError && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">{saveError}</p>
            )}
          </section>

          <TableActivityLogPanel
            tableId={sale.id}
            snapshot={sale.activityLog}
            orderItemIds={orderItemIds}
            itemNameByOrderId={itemNameById}
            defaultOpen
          />
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
          {canEdit && (
            editMode ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditMode(false);
                    setEditItems(sale.items);
                    setEditDiscount(sale.discountAmount);
                    setEditTip(sale.tip);
                    setSaveError(null);
                  }}
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium dark:border-gray-700"
                >
                  {translate("cancel")}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveEdit()}
                  className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {translate("saveChanges")}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setEditMode(true)}
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium dark:border-gray-700"
                >
                  {translate("editOrder")}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                  {translate("deleteOrder")}
                </button>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
