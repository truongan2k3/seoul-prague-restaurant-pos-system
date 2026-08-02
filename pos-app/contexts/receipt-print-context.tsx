"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { PrintableReceipt } from "@/components/printable-receipt";
import { useApp } from "@/contexts/app-context";
import { buildReceiptData, type ReceiptData } from "@/lib/receipt-calculations";
import type { CheckoutPaymentRecord } from "@/lib/checkout-calculations";
import type { MenuItem, OrderItem } from "@/lib/types";

interface PrintReceiptInput {
  tableLabel: string;
  staffName?: string;
  orders: OrderItem[];
  payment: CheckoutPaymentRecord;
  menuItems: MenuItem[];
  closedAt?: Date;
}

interface ReceiptPrintContextValue {
  printReceipt: (input: PrintReceiptInput) => void;
}

const ReceiptPrintContext = createContext<ReceiptPrintContextValue | null>(null);

export function ReceiptPrintProvider({ children }: { children: ReactNode }) {
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const { receiptShowEur, receiptShowUsd, eurRate, usdRate } = useApp();

  const printReceipt = useCallback((input: PrintReceiptInput) => {
    const data = buildReceiptData({
      tableLabel: input.tableLabel,
      staffName: input.staffName,
      orders: input.orders,
      payment: input.payment,
      menuItems: input.menuItems,
      closedAt: input.closedAt,
      showEur: receiptShowEur,
      showUsd: receiptShowUsd,
      eurRate,
      usdRate,
    });
    setReceiptData(data);

    requestAnimationFrame(() => {
      setTimeout(() => {
        window.print();
      }, 150);
    });
  }, [receiptShowEur, receiptShowUsd, eurRate, usdRate]);

  return (
    <ReceiptPrintContext.Provider value={{ printReceipt }}>
      {children}
      <PrintableReceipt data={receiptData} />
    </ReceiptPrintContext.Provider>
  );
}

export function useReceiptPrint() {
  const ctx = useContext(ReceiptPrintContext);
  if (!ctx) {
    throw new Error("useReceiptPrint must be used within ReceiptPrintProvider");
  }
  return ctx;
}
