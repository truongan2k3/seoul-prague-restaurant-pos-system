"use client";

import { useRef, useState } from "react";
import { ChangeTableModal } from "@/components/change-table-modal";
import { NewOrderModal } from "@/components/new-order-modal";
import { PaymentModal } from "@/components/payment-modal";
import type { CheckoutSubmitPayload } from "@/components/checkout-panel";
import { useApp } from "@/contexts/app-context";
import { useReceiptPrint } from "@/contexts/receipt-print-context";
import { useSettings } from "@/contexts/settings-context";
import {
  applyFulfillmentModeToNewOrders,
  shouldPrintKitchenOnSend,
} from "@/lib/kitchen-fulfillment-mode";
import { ordersFromLines } from "@/lib/checkout-calculations";
import { finalizeBillOnlyOrder } from "@/lib/menu-item-dispatch";
import { filterItemsForBoard } from "@/lib/order-board";
import { sendCfdEvent } from "@/lib/cfd-display";
import type { MenuCategoryRecord, MenuItem, OrderItem, RestaurantTable } from "@/lib/types";
import {
  appendOrdersToTable,
  checkoutTable,
  forceCloseTable,
  mergeTables,
  occupyTable,
  transferTable,
  updateTableOrders,
} from "@/src/lib/table-actions";
import { mapTableRow } from "@/src/lib/supabase-data";

export type TableOrderModalState =
  | { type: "new-order"; tableId: string; mode: "new" | "append" }
  | { type: "change-table"; tableId: string; returnTo?: "new-order-append" }
  | { type: "checkout"; tableId: string; orders: OrderItem[] }
  | null;

interface UseTableOrderWorkflowOptions {
  tables: RestaurantTable[];
  setTables: React.Dispatch<React.SetStateAction<RestaurantTable[]>>;
  menuItems: MenuItem[];
  categories: MenuCategoryRecord[];
  orderItems: OrderItem[];
  onRefresh: () => void;
  onRefreshFloor?: () => void;
}

export function useTableOrderWorkflow({
  tables,
  setTables,
  menuItems,
  categories,
  orderItems,
  onRefresh,
  onRefreshFloor,
}: UseTableOrderWorkflowOptions) {
  const refreshAfterAction = onRefreshFloor ?? onRefresh;
  const { staff, logAction } = useApp();
  const { settings } = useSettings();
  const { printReceipt, printKitchenOrder } = useReceiptPrint();
  const [modal, setModal] = useState<TableOrderModalState>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const actionLockRef = useRef(false);

  const selectedTable = modal ? tables.find((t) => t.id === modal.tableId) : undefined;

  const openChangeTable = (tableId: string, returnTo?: "new-order-append") => {
    setActionError(null);
    setModal({ type: "change-table", tableId, returnTo });
  };

  const openNewOrder = (tableId: string, mode: "new" | "append" = "new") => {
    setActionError(null);
    setModal({ type: "new-order", tableId, mode });
  };

  /** Empty → new order; occupied → split menu + current bill (Send / Checkout). */
  const handleTableClick = (table: RestaurantTable) => {
    if (table.status === "empty") {
      openNewOrder(table.id, "new");
    } else {
      openNewOrder(table.id, "append");
    }
  };

  const handleSendToKitchen = async (orders: OrderItem[]) => {
    if (!modal || modal.type !== "new-order") return;
    if (actionLockRef.current) return;

    actionLockRef.current = true;
    setIsSaving(true);
    setActionError(null);

    try {
      const preparedOrders = applyFulfillmentModeToNewOrders(
        orders,
        settings.kitchenFulfillmentMode,
      );
      const isAppend = modal.mode === "append";
      const { data, error } = isAppend
        ? await appendOrdersToTable(
            modal.tableId,
            preparedOrders,
            staff?.id,
            staff?.name,
            selectedTable?.label,
          )
        : await occupyTable(
            modal.tableId,
            preparedOrders,
            staff?.id,
            staff?.name,
            selectedTable?.label,
          );

      if (error || !data) {
        setActionError(error?.message ?? "Failed to send order.");
        return;
      }

      logAction(isAppend ? "add items" : "new order", `Table ${selectedTable?.label}`);

      if (shouldPrintKitchenOnSend(settings) && !settings.kitchenPrintViaStation && selectedTable) {
        void printKitchenOrder({
          tableLabel: selectedTable.label,
          orders: preparedOrders,
          menuItems,
        }).catch((printError) => {
          console.warn("[KitchenPrint] Failed:", printError);
        });
      }

      const updatedTable = mapTableRow(data);
      setTables((prev) => prev.map((t) => (t.id === modal.tableId ? updatedTable : t)));
      // Stay on the table screen after send so staff can checkout or add more.
      setModal({ type: "new-order", tableId: modal.tableId, mode: "append" });
      refreshAfterAction();
    } finally {
      actionLockRef.current = false;
      setIsSaving(false);
    }
  };

  const handleAppendCartNoPrint = async (orders: OrderItem[]) => {
    if (!modal || modal.type !== "new-order") return;
    if (actionLockRef.current) return;

    actionLockRef.current = true;
    setIsSaving(true);
    setActionError(null);

    try {
      const silentOrders = orders.map((item) =>
        finalizeBillOnlyOrder({
          ...item,
          skipPrint: true,
          hideOnKds: true,
        }),
      );

      const isAppend = modal.mode === "append";
      const { data, error } = isAppend
        ? await appendOrdersToTable(
            modal.tableId,
            silentOrders,
            staff?.id,
            staff?.name,
            selectedTable?.label,
          )
        : await occupyTable(
            modal.tableId,
            silentOrders,
            staff?.id,
            staff?.name,
            selectedTable?.label,
          );

      if (error || !data) {
        setActionError(error?.message ?? "Failed to save order.");
        return;
      }

      logAction(
        isAppend ? "save no print" : "save no print (new table)",
        `Table ${selectedTable?.label}`,
      );

      const updatedTable = mapTableRow(data);
      setTables((prev) => prev.map((t) => (t.id === modal.tableId ? updatedTable : t)));
      setModal({ type: "new-order", tableId: modal.tableId, mode: "append" });
      refreshAfterAction();
    } finally {
      actionLockRef.current = false;
      setIsSaving(false);
    }
  };

  const handleSaveOrders = async (
    orders: OrderItem[],
    tableId?: string,
    options?: { silent?: boolean; printOrders?: OrderItem[] },
  ) => {
    const targetTableId =
      tableId ?? (modal?.type === "new-order" ? modal.tableId : undefined);
    if (!targetTableId) return;
    setIsSaving(true);
    setActionError(null);
    const { data, error } = await updateTableOrders(targetTableId, orders, {
      staffId: staff?.id,
      staffName: staff?.name,
      tableLabel: selectedTable?.label,
      silent: options?.silent,
      printOrders: options?.printOrders,
    });
    setIsSaving(false);
    if (error) {
      setActionError(error.message);
      return;
    }
    if (orders.length === 0) {
      logAction("clear table", `Table ${selectedTable?.label}`);
    } else {
      logAction(
        options?.silent ? "save table order (no print)" : "send table order changes",
        `Table ${selectedTable?.label}`,
      );
    }
    if (data) {
      const updatedTable = mapTableRow(data);
      setTables((prev) => prev.map((t) => (t.id === targetTableId ? updatedTable : t)));
    }
    if (
      !options?.silent &&
      options?.printOrders &&
      options.printOrders.length > 0 &&
      shouldPrintKitchenOnSend(settings) &&
      !settings.kitchenPrintViaStation &&
      selectedTable
    ) {
      void printKitchenOrder({
        tableLabel: selectedTable.label,
        orders: options.printOrders,
        menuItems,
      }).catch((printError) => {
        console.warn("[KitchenPrint] Failed:", printError);
      });
    }
    refreshAfterAction();
  };

  const handleProceedToCheckout = (orders: OrderItem[], explicitTableId?: string) => {
    const tableId = explicitTableId ?? modal?.tableId ?? selectedTable?.id;
    if (!tableId || orders.length === 0) return;

    const table = tables.find((t) => t.id === tableId);
    if (!table || table.paymentStatus === "paid") return;

    setActionError(null);
    setModal({ type: "checkout", tableId, orders });

    void updateTableOrders(tableId, orders, {
      staffId: staff?.id,
      staffName: staff?.name,
      tableLabel: table.label,
    }).then(({ data, error }) => {
      if (error) {
        setActionError(error.message);
        return;
      }
      if (data) {
        const updatedTable = mapTableRow(data);
        setTables((prev) => prev.map((t) => (t.id === tableId ? updatedTable : t)));
      }
      refreshAfterAction();
    });
  };

  const handleForceCloseTable = async () => {
    if (!modal || modal.type !== "new-order") return;
    setIsSaving(true);
    setActionError(null);
    const { data, error } = await forceCloseTable(modal.tableId);
    setIsSaving(false);
    if (error) {
      setActionError(error.message);
      return;
    }
    logAction("close table", `Table ${selectedTable?.label}`);
    if (data) {
      const updatedTable = mapTableRow(data);
      setTables((prev) => prev.map((t) => (t.id === modal.tableId ? updatedTable : t)));
    }
    setModal(null);
    refreshAfterAction();
  };

  const handleCheckout = async (payload: CheckoutSubmitPayload) => {
    if (!modal || modal.type !== "checkout" || !selectedTable) return;
    setIsSaving(true);
    setActionError(null);
    const remainingOrders = payload.remainingLines
      ? ordersFromLines(payload.remainingLines)
      : undefined;

    const { data, error } = await checkoutTable(
      modal.tableId,
      selectedTable.label,
      payload.paidOrders,
      staff?.id,
      staff?.name ?? "Staff",
      payload.payment,
      { remainingOrders, closeTable: payload.closeTable },
    );
    setIsSaving(false);
    if (error) {
      setActionError(error.message);
      return;
    }
    logAction(
      "checkout",
      `Table ${selectedTable.label} · ${payload.payment.paymentMethod} · ${payload.payment.amountDueNow.toFixed(2)} Kč`,
    );

    if (payload.printReceipt ?? settings.autoPrintOnPayment) {
      printReceipt({
        tableLabel: selectedTable.label,
        staffName: staff?.name,
        orders: payload.paidOrders,
        payment: payload.payment,
        menuItems,
      });
    }

    void sendCfdEvent("PAYMENT_SUCCESS", { tableNumber: selectedTable.label });

    const continuingSplit =
      !payload.closeTable &&
      (payload.payment.splitMode === "equal" ||
        (payload.payment.splitMode === "items" &&
          remainingOrders !== undefined &&
          remainingOrders.length > 0));

    if (continuingSplit) {
      const nextOrders =
        payload.payment.splitMode === "items" && remainingOrders
          ? remainingOrders
          : modal.orders;

      if (data) {
        const updatedTable = mapTableRow(data);
        setTables((prev) => prev.map((t) => (t.id === modal.tableId ? updatedTable : t)));
      } else if (remainingOrders !== undefined) {
        setTables((prev) =>
          prev.map((t) =>
            t.id === modal.tableId ? { ...t, orders: remainingOrders } : t,
          ),
        );
      }

      setModal({ type: "checkout", tableId: modal.tableId, orders: nextOrders });

      // Equal-split CFD is driven by CheckoutPanel (per-person share).
      // Item-split keeps existing orders until picker updates CFD.
      if (payload.payment.splitMode === "items") {
        // CheckoutPanel will broadcast once items are selected.
      }
      refreshAfterAction();
      return;
    }

    if (data) {
      const updatedTable = mapTableRow(data);
      setTables((prev) => prev.map((t) => (t.id === modal.tableId ? updatedTable : t)));
      // Paid tables stay visible until kitchen idle / auto-serve clears.
      setModal(null);
    } else if (payload.closeTable) {
      setTables((prev) =>
        prev.map((t) =>
          t.id === modal.tableId
            ? {
                ...t,
                status: "empty",
                occupiedAt: undefined,
                orders: undefined,
                paymentStatus: "unpaid",
                fulfillmentStatus: "in_progress",
              }
            : t,
        ),
      );
      setModal(null);
    } else if (remainingOrders !== undefined) {
      setTables((prev) =>
        prev.map((t) =>
          t.id === modal.tableId
            ? {
                ...t,
                orders: remainingOrders,
                status: remainingOrders.length === 0 ? "empty" : t.status,
                occupiedAt: remainingOrders.length === 0 ? undefined : t.occupiedAt,
              }
            : t,
        ),
      );
      setModal(
        remainingOrders.length === 0
          ? null
          : { type: "new-order", tableId: modal.tableId, mode: "append" },
      );
    } else {
      setModal({ type: "new-order", tableId: modal.tableId, mode: "append" });
    }

    refreshAfterAction();
  };

  const finishChangeTable = (fromId: string, toId: string, action: "transfer" | "merge") => {
    const fromLabel = tables.find((t) => t.id === fromId)?.label ?? fromId;
    const toLabel = tables.find((t) => t.id === toId)?.label ?? toId;
    logAction(action === "merge" ? "merge table" : "transfer table", `${fromLabel} → ${toLabel}`);

    if (modal?.type === "change-table" && modal.returnTo === "new-order-append") {
      setModal({ type: "new-order", tableId: toId, mode: "append" });
    } else {
      setModal(null);
    }
    refreshAfterAction();
  };

  const handleTransferTable = async (toId: string) => {
    if (!modal || modal.type !== "change-table") return;
    setIsSaving(true);
    setActionError(null);
    const fromId = modal.tableId;
    const { error } = await transferTable(fromId, toId);
    setIsSaving(false);
    if (error) {
      setActionError(error.message);
      return;
    }
    finishChangeTable(fromId, toId, "transfer");
  };

  const handleMergeTable = async (toId: string) => {
    if (!modal || modal.type !== "change-table") return;
    setIsSaving(true);
    setActionError(null);
    const fromId = modal.tableId;
    const { error } = await mergeTables([fromId], toId);
    setIsSaving(false);
    if (error) {
      setActionError(error.message);
      return;
    }
    finishChangeTable(fromId, toId, "merge");
  };

  const floorItemsForTable = (tableId: string) =>
    filterItemsForBoard(
      orderItems.filter((item) => item.tableId === tableId),
      "floor",
    );

  const modals = (
    <>
      {selectedTable && modal?.type === "change-table" && (
        <ChangeTableModal
          open
          table={selectedTable}
          allTables={tables}
          onClose={() => {
            if (modal.returnTo === "new-order-append") {
              setModal({ type: "new-order", tableId: selectedTable.id, mode: "append" });
            } else {
              setModal(null);
            }
          }}
          onTransfer={handleTransferTable}
          onMerge={handleMergeTable}
          isSaving={isSaving}
          error={actionError}
        />
      )}

      {selectedTable && modal?.type === "checkout" && (
        <PaymentModal
          open
          table={selectedTable}
          orders={modal.orders}
          menuItems={menuItems}
          onClose={() => setModal(null)}
          onBack={() => setModal({ type: "new-order", tableId: modal.tableId, mode: "append" })}
          onConfirm={handleCheckout}
          isSaving={isSaving}
          error={actionError}
        />
      )}

      {selectedTable && modal?.type === "new-order" && (
        <NewOrderModal
          open
          table={selectedTable}
          tableLabel={selectedTable.label}
          menuItems={menuItems}
          categories={categories}
          mode={modal.mode}
          existingOrders={floorItemsForTable(selectedTable.id)}
          onClose={() => setModal(null)}
          onSendToKitchen={handleSendToKitchen}
          onAppendCartNoPrint={handleAppendCartNoPrint}
          onCheckout={handleProceedToCheckout}
          onCloseTable={handleForceCloseTable}
          onChangeTable={() => openChangeTable(selectedTable.id, "new-order-append")}
          onSaveExistingOrders={(orders, options) =>
            handleSaveOrders(orders, selectedTable.id, options)
          }
          onRefreshExistingOrders={refreshAfterAction}
          isSaving={isSaving}
        />
      )}
    </>
  );

  return {
    modal,
    actionError,
    setActionError,
    openChangeTable,
    openNewOrder,
    openCheckoutForTable: (tableId: string) => {
      const orders = filterItemsForBoard(
        orderItems.filter((item) => item.tableId === tableId),
        "floor",
      );
      void handleProceedToCheckout(orders, tableId);
    },
    handleTableClick,
    tableOrderModals: modals,
    isSaving,
  };
}
