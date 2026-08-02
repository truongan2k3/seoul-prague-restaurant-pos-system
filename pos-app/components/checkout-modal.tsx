"use client";

import { useMemo, useState } from "react";
import { CheckoutPanel, type CheckoutSubmitPayload } from "@/components/checkout-panel";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import { usePinGate } from "@/contexts/pin-gate-context";
import { formatPrice } from "@/lib/i18n/translations";
import { expandCheckoutLines } from "@/lib/checkout-calculations";
import type { MenuItem, OrderItem, RestaurantTable } from "@/lib/types";

interface CheckoutModalProps {
  open: boolean;
  table: RestaurantTable;
  allTables: RestaurantTable[];
  orders: OrderItem[];
  menuItems: MenuItem[];
  onClose: () => void;
  onCheckout: (payload: CheckoutSubmitPayload) => void | Promise<void>;
  onTransfer: (toTableId: string) => void | Promise<void>;
  onMerge: (sourceIds: string[]) => void | Promise<void>;
  onAddItems?: () => void;
  isSaving?: boolean;
}

export function CheckoutModal({
  open,
  table,
  allTables,
  orders,
  menuItems,
  onClose,
  onCheckout,
  onTransfer,
  onMerge,
  onAddItems,
  isSaving = false,
}: CheckoutModalProps) {
  const { translate } = useApp();
  const { requestPin } = usePinGate();
  const [transferTo, setTransferTo] = useState("");
  const [mergeFrom, setMergeFrom] = useState<string[]>([]);

  const lines = useMemo(() => expandCheckoutLines(orders), [orders]);

  const emptyTables = allTables.filter((t) => t.status === "empty" && t.id !== table.id);
  const otherActive = allTables.filter((t) => t.status !== "empty" && t.id !== table.id);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      scrollBody={false}
      bodyClassName="flex min-h-0 flex-col p-0"
      title={`${translate("checkout")} — ${translate("table")} ${table.label}`}
    >
      <ul className="mx-4 mt-4 divide-y dark:divide-zinc-800 sm:mx-6">
        {orders.map((item, idx) => (
          <li key={idx} className="flex justify-between py-2 text-sm">
            <span>
              {item.name} ×{item.quantity}
              {item.notes && ` (${item.notes})`}
            </span>
            <span>{formatPrice(item.price * item.quantity)}</span>
          </li>
        ))}
      </ul>

      {onAddItems && (
        <button
          type="button"
          onClick={onAddItems}
          className="mx-4 mb-2 mt-4 w-[calc(100%-2rem)] rounded-lg border border-orange-200 bg-orange-50 py-2 text-sm font-medium text-orange-800 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-200 sm:mx-6 sm:w-[calc(100%-3rem)]"
        >
          {translate("addItems")}
        </button>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <CheckoutPanel
          lines={lines}
          orderSummary={orders}
          menuItems={menuItems}
          isSaving={isSaving}
          onCheckout={onCheckout}
        />
      </div>

      <div className="mx-4 mb-4 space-y-4 border-t pt-4 dark:border-zinc-800 sm:mx-6">
        <div>
          <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{translate("transfer")}</p>
          <div className="mt-2 flex gap-2">
            <select
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
              className="pos-input flex-1 py-2"
            >
              <option value="">{translate("selectEmptyTable")}</option>
              {emptyTables.map((t) => (
                <option key={t.id} value={t.id}>
                  {translate("table")} {t.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!transferTo}
              onClick={() => requestPin(() => void onTransfer(transferTo))}
              className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-800 dark:border-gray-600 dark:text-gray-200"
            >
              {translate("transfer")}
            </button>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{translate("merge")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {otherActive.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  setMergeFrom((p) =>
                    p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id],
                  )
                }
                className={`rounded-md px-2 py-1 text-xs ${
                  mergeFrom.includes(t.id)
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                {translate("table")} {t.label}
              </button>
            ))}
          </div>
          {mergeFrom.length > 0 && (
            <button
              type="button"
              onClick={() => requestPin(() => void onMerge(mergeFrom))}
              className="mt-2 rounded-lg border px-3 py-2 text-xs font-medium dark:border-zinc-700"
            >
              {translate("merge")} → {translate("table")} {table.label}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
