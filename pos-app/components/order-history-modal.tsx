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
import { paymentFilterClass } from "@/lib/theme-classes";
import type { MenuItem, OrderItem, PaymentMethod, SaleRecord } from "@/lib/types";
import { deleteSaleRecords, updateSaleRecord } from "@/src/lib/sales-actions";

type EditScope = "payment" | "full";

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
    // DB stores per-share amounts; avoid halving again on reprint.
    splitMode: isEqualShare ? "total" : (sale.splitMode ?? "total"),
    splitCount: 1,
  };
}

function resolveCashAmounts(grandTotal: number, amountGivenRaw: number) {
  const amountGiven = amountGivenRaw > 0 ? amountGivenRaw : grandTotal;
  const changeDue = Math.max(0, amountGiven - grandTotal);
  return { amountGiven, changeDue };
}

interface OrderHistoryModalProps {
  sale: SaleRecord;
  menuItems: MenuItem[];
  onClose: () => void;
  onUpdated: (sale: SaleRecord) => void;
  onDeleted?: (saleId: string) => void;
  /** @deprecated use initialEditScope */
  initialEditMode?: boolean;
  initialEditScope?: EditScope | false;
}

export function OrderHistoryModal({
  sale,
  menuItems,
  onClose,
  onUpdated,
  onDeleted,
  initialEditMode = false,
  initialEditScope,
}: OrderHistoryModalProps) {
  const resolvedInitialScope: EditScope | false =
    initialEditScope ?? (initialEditMode ? "payment" : false);

  const { translate, currentStaffUser, logAction } = useApp();
  const { printReceipt } = useReceiptPrint();
  const { pushNotification } = useNotifications();
  const { requestDeletion } = useAdminDeletionGate();
  const [editScope, setEditScope] = useState<EditScope | false>(resolvedInitialScope);
  const [editItems, setEditItems] = useState<OrderItem[]>(sale.items);
  const [editDiscount, setEditDiscount] = useState(sale.discountAmount);
  const [editTip, setEditTip] = useState(sale.tip);
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>(sale.paymentMethod);
  const [editAmountGiven, setEditAmountGiven] = useState(
    sale.amountGiven != null ? String(sale.amountGiven) : "",
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canEdit = canManageStaff(currentStaffUser?.role);
  const editMode = editScope !== false;
  const paymentOnlyEdit = editScope === "payment";

  const orderItemIds = useMemo(
    () => sale.items.map((item) => item.id).filter((id): id is string => Boolean(id)),
    [sale.items],
  );
  const itemNameById = useMemo(
    () => new Map(sale.items.filter((item) => item.id).map((item) => [item.id!, item.name])),
    [sale.items],
  );

  const resetEditState = () => {
    setEditItems(sale.items);
    setEditDiscount(sale.discountAmount);
    setEditTip(sale.tip);
    setEditPaymentMethod(sale.paymentMethod);
    setEditAmountGiven(sale.amountGiven != null ? String(sale.amountGiven) : "");
    setSaveError(null);
  };

  useEffect(() => {
    setEditScope(resolvedInitialScope);
    resetEditState();
  }, [sale, resolvedInitialScope]);

  const editSubtotal = useMemo(() => sumLines(editItems), [editItems]);
  const editGrandTotal = useMemo(
    () => Math.max(0, editSubtotal - editDiscount) + editTip,
    [editSubtotal, editDiscount, editTip],
  );
  const editChangeDue = useMemo(() => {
    if (editPaymentMethod !== "cash") return 0;
    const given = Number(editAmountGiven) || 0;
    if (given <= 0) return 0;
    return Math.max(0, given - editGrandTotal);
  }, [editPaymentMethod, editAmountGiven, editGrandTotal]);

  const displayPaymentMethod = editMode ? editPaymentMethod : sale.paymentMethod;
  const displayAmountGiven = editMode
    ? editPaymentMethod === "cash"
      ? Number(editAmountGiven) || editGrandTotal
      : undefined
    : sale.amountGiven;
  const displayChangeDue = editMode
    ? editPaymentMethod === "cash"
      ? editChangeDue
      : undefined
    : sale.changeDue;

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

    const cashFields =
      editPaymentMethod === "cash"
        ? resolveCashAmounts(editGrandTotal, Number(editAmountGiven) || 0)
        : { amountGiven: null as number | null, changeDue: null as number | null };

    const { error } = await updateSaleRecord(sale.id, {
      items: editItems,
      subtotal: editSubtotal,
      discountAmount: editDiscount,
      tip: editTip,
      grandTotal: editGrandTotal,
      paymentMethod: editPaymentMethod,
      amountGiven: cashFields.amountGiven,
      changeDue: cashFields.changeDue,
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
      paymentMethod: editPaymentMethod,
      amountGiven: cashFields.amountGiven ?? undefined,
      changeDue: cashFields.changeDue ?? undefined,
    };
    onUpdated(updated);
    setEditScope(false);

    const changes: string[] = [];
    if (sale.tip !== editTip) changes.push(`tip ${sale.tip}→${editTip}`);
    if (sale.paymentMethod !== editPaymentMethod) {
      changes.push(`${sale.paymentMethod}→${editPaymentMethod}`);
    }
    if (sale.grandTotal !== editGrandTotal) changes.push(`total ${sale.grandTotal}→${editGrandTotal}`);
    logAction(
      "edit_sale",
      `Order ${generateOrderNumber(sale.closedAt)} · ${sale.tableLabel}${changes.length ? ` · ${changes.join(", ")}` : ""}`,
    );
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
            {editMode && !paymentOnlyEdit ? (
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
              <div className="mb-4 space-y-3 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">{translate("paymentMethod")}</span>
                  <div className="mt-2 flex gap-2">
                    {(["cash", "card"] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => {
                          setEditPaymentMethod(method);
                          if (method === "cash" && !editAmountGiven) {
                            setEditAmountGiven(String(editGrandTotal));
                          }
                        }}
                        className={`min-h-[40px] flex-1 rounded-lg px-3 text-sm font-semibold capitalize ${paymentFilterClass(
                          editPaymentMethod === method,
                          method,
                        )}`}
                      >
                        {translate(method)}
                      </button>
                    ))}
                  </div>
                </div>
                {editPaymentMethod === "cash" && (
                  <label className="block space-y-1">
                    <span>{translate("amountGiven")}</span>
                    <NumericInputField
                      value={editAmountGiven}
                      onChange={setEditAmountGiven}
                      allowDecimal
                      inputClassName="w-full rounded border border-gray-200 px-2 py-1 text-right text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {editChangeDue > 0 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {translate("changeDue")}: {formatCzk(editChangeDue)}
                      </p>
                    )}
                  </label>
                )}
                <label className="block space-y-1">
                  <span>{translate("discount")}</span>
                  <NumericInputField
                    value={editDiscount > 0 ? String(editDiscount) : ""}
                    onChange={(raw) => setEditDiscount(Math.max(0, Number(raw) || 0))}
                    allowDecimal
                    inputClassName="w-full rounded border border-gray-200 px-2 py-1 text-right text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                </label>
                <label className="block space-y-1">
                  <span>{translate("tip")}</span>
                  <NumericInputField
                    value={editTip > 0 ? String(editTip) : ""}
                    onChange={(raw) => setEditTip(Math.max(0, Number(raw) || 0))}
                    allowDecimal
                    inputClassName="w-full rounded border border-gray-200 px-2 py-1 text-right text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                </label>
              </div>
            ) : (
              <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-500 dark:text-gray-400">{translate("paymentMethod")}:</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                    displayPaymentMethod === "cash"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                      : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
                  }`}
                >
                  {translate(displayPaymentMethod)}
                </span>
                {displayPaymentMethod === "cash" && displayAmountGiven != null && (
                  <span className="text-gray-600 dark:text-gray-300">
                    · {translate("amountGiven")} {formatCzk(displayAmountGiven)}
                    {(displayChangeDue ?? 0) > 0
                      ? ` · ${translate("changeDue")} ${formatCzk(displayChangeDue ?? 0)}`
                      : ""}
                  </span>
                )}
              </div>
            )}
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">{translate("subtotal")}</dt>
                <dd className="tabular-nums">
                  {formatCzk(editMode && !paymentOnlyEdit ? editSubtotal : sale.subtotal)}
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
                    setEditScope(false);
                    resetEditState();
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
                  onClick={() => setEditScope("payment")}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200"
                >
                  {translate("editTipAndPayment")}
                </button>
                <button
                  type="button"
                  onClick={() => setEditScope("full")}
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
