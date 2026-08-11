"use client";

import { useState } from "react";
import { ManageTableModal } from "@/components/manage-table-modal";
import { NewOrderModal } from "@/components/new-order-modal";
import { PaymentModal } from "@/components/payment-modal";
import type { CheckoutSubmitPayload } from "@/components/checkout-panel";
import { useApp } from "@/contexts/app-context";
import { useReceiptPrint } from "@/contexts/receipt-print-context";
import { useSettings } from "@/contexts/settings-context";
import { ordersFromLines } from "@/lib/checkout-calculations";
import { filterItemsForBoard } from "@/lib/order-board";
import { sendCfdEvent } from "@/lib/cfd-display";
import type { MenuCategoryRecord, MenuItem, OrderItem, RestaurantTable } from "@/lib/types";
import {
  appendOrdersToTable,
  checkoutTable,
  forceCloseTable,
  occupyTable,
  transferTable,
  updateTableOrders,
} from "@/src/lib/table-actions";
import { mapTableRow } from "@/src/lib/supabase-data";

export type TableOrderModalState =
  | { type: "new-order"; tableId: string; mode: "new" | "append" }
  | { type: "manage-table"; tableId: string }
  | { type: "checkout"; tableId: string; orders: OrderItem[] }
  | null;

interface UseTableOrderWorkflowOptions {
  tables: RestaurantTable[];
  setTables: React.Dispatch<React.SetStateAction<RestaurantTable[]>>;
  menuItems: MenuItem[];
  categories: MenuCategoryRecord[];
  orderItems: OrderItem[];
  onRefresh: () => void;
}

export function useTableOrderWorkflow({
  tables,
  setTables,
  menuItems,
  categories,
  orderItems,
  onRefresh,
}: UseTableOrderWorkflowOptions) {
  const { staff, logAction } = useApp();
  const { settings } = useSettings();
  const { printReceipt, printKitchenOrder } = useReceiptPrint();
  const [modal, setModal] = useState<TableOrderModalState>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectedTable = modal ? tables.find((t) => t.id === modal.tableId) : undefined;

  const openManageTable = (tableId: string) => {
    setActionError(null);
    setModal({ type: "manage-table", tableId });
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

    setIsSaving(true);
    setActionError(null);

    const isAppend = modal.mode === "append";
    const { data, error } = isAppend
      ? await appendOrdersToTable(modal.tableId, orders, staff?.id, staff?.name)
      : await occupyTable(modal.tableId, orders, staff?.id, staff?.name);

    setIsSaving(false);

    if (error || !data) {
      setActionError(error?.message ?? "Failed to send order.");
      return;
    }

    logAction(isAppend ? "add items" : "new order", `Table ${selectedTable?.label}`);

    if (settings.kitchenPrintEnabled && !settings.kitchenPrintViaStation && selectedTable) {
      void printKitchenOrder({
        tableLabel: selectedTable.label,
        orders,
        menuItems,
      }).catch((printError) => {
        console.warn("[KitchenPrint] Failed:", printError);
      });
    }

    const updatedTable = mapTableRow(data);
    setTables((prev) => prev.map((t) => (t.id === modal.tableId ? updatedTable : t)));
    // Stay on the table screen after send so staff can checkout or add more.
    setModal({ type: "new-order", tableId: modal.tableId, mode: "append" });
    onRefresh();
  };

  const handleSaveOrders = async (orders: OrderItem[]) => {
    if (!modal || modal.type !== "manage-table") return;
    setIsSaving(true);
    setActionError(null);
    const { data, error } = await updateTableOrders(modal.tableId, orders);
    setIsSaving(false);
    if (error) {
      setActionError(error.message);
      return;
    }
    if (orders.length === 0) {
      logAction("clear table", `Table ${selectedTable?.label}`);
    } else {
      logAction("update table order", `Table ${selectedTable?.label}`);
    }
    if (data) {
      const updatedTable = mapTableRow(data);
      setTables((prev) => prev.map((t) => (t.id === modal.tableId ? updatedTable : t)));
    }
    if (orders.length === 0) {
      setModal(null);
    }
    onRefresh();
  };

  const handleProceedToCheckout = async (orders: OrderItem[]) => {
    if (!selectedTable || orders.length === 0) return;
    if (selectedTable.paymentStatus === "paid") return;

    const tableId = modal?.tableId ?? selectedTable.id;

    setIsSaving(true);
    setActionError(null);
    const { data, error } = await updateTableOrders(tableId, orders);
    setIsSaving(false);

    if (error) {
      setActionError(error.message);
      return;
    }

    if (data) {
      const updatedTable = mapTableRow(data);
      setTables((prev) => prev.map((t) => (t.id === tableId ? updatedTable : t)));
    }

    setModal({ type: "checkout", tableId, orders });
  };

  const handleForceCloseTable = async () => {
    if (!modal || (modal.type !== "new-order" && modal.type !== "manage-table")) return;
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
    onRefresh();
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

    if (settings.autoPrintOnPayment) {
      printReceipt({
        tableLabel: selectedTable.label,
        staffName: staff?.name,
        orders: payload.paidOrders,
        payment: payload.payment,
        menuItems,
      });
    }

    void sendCfdEvent("PAYMENT_SUCCESS", { tableNumber: selectedTable.label });

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

    onRefresh();
  };

  const handleTransfer = async (toId: string) => {
    if (!modal || modal.type !== "manage-table") return;
    setIsSaving(true);
    setActionError(null);
    const { error } = await transferTable(modal.tableId, toId);
    setIsSaving(false);
    if (error) {
      setActionError(error.message);
      return;
    }
    logAction("transfer table", `${selectedTable?.label} → ${toId}`);
    setModal(null);
    onRefresh();
  };

  const floorItemsForTable = (tableId: string) =>
    filterItemsForBoard(
      orderItems.filter((item) => item.tableId === tableId),
      "floor",
    );

  const modals = (
    <>
      {selectedTable && modal?.type === "manage-table" && (
        <ManageTableModal
          open
          table={selectedTable}
          allTables={tables}
          menuItems={menuItems}
          orderItems={floorItemsForTable(selectedTable.id)}
          onClose={() => setModal({ type: "new-order", tableId: selectedTable.id, mode: "append" })}
          onSaveOrders={handleSaveOrders}
          onTransfer={handleTransfer}
          onProceedToCheckout={handleProceedToCheckout}
          onAddItems={() => openNewOrder(selectedTable.id, "append")}
          onRefresh={onRefresh}
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
          onCheckout={handleProceedToCheckout}
          onCloseTable={handleForceCloseTable}
          onManage={() => openManageTable(selectedTable.id)}
          isSaving={isSaving}
        />
      )}
    </>
  );

  return {
    modal,
    actionError,
    setActionError,
    openManageTable,
    openNewOrder,
    handleTableClick,
    tableOrderModals: modals,
  };
}
