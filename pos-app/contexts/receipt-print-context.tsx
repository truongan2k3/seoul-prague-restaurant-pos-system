"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { ReceiptPreviewModal } from "@/components/receipt-preview-modal";
import { ReceiptPrint, settingsToReceiptBusiness, settingsToReceiptTemplate } from "@/src/components/ReceiptPrint";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import {
  buildReceiptData,
  buildTestReceiptData,
  type ReceiptData,
} from "@/lib/receipt-calculations";
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
  printTestReceipt: () => void;
  openReceiptPreview: (data: ReceiptData) => void;
}

const ReceiptPrintContext = createContext<ReceiptPrintContextValue | null>(null);

function triggerBrowserPrint() {
  requestAnimationFrame(() => {
    setTimeout(() => {
      window.print();
    }, 200);
  });
}

export function ReceiptPrintProvider({ children }: { children: ReactNode }) {
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { receiptShowEur, receiptShowUsd, eurRate, usdRate } = useApp();
  const { settings } = useSettings();

  const business = settingsToReceiptBusiness(settings);
  const template = settingsToReceiptTemplate(settings);

  const openReceiptPreview = useCallback((data: ReceiptData) => {
    setReceiptData(data);
    setPreviewOpen(true);
  }, []);

  const printReceipt = useCallback(
    (input: PrintReceiptInput) => {
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
        business,
      });
      setReceiptData(data);
      triggerBrowserPrint();
    },
    [receiptShowEur, receiptShowUsd, eurRate, usdRate, business],
  );

  const printTestReceipt = useCallback(() => {
    openReceiptPreview(buildTestReceiptData(business));
  }, [business, openReceiptPreview]);

  const handlePrintFromPreview = useCallback(() => {
    setPreviewOpen(false);
    triggerBrowserPrint();
  }, []);

  return (
    <ReceiptPrintContext.Provider value={{ printReceipt, printTestReceipt, openReceiptPreview }}>
      {children}
      <ReceiptPrint data={receiptData} template={template} />
      <ReceiptPreviewModal
        open={previewOpen}
        data={receiptData}
        template={template}
        onClose={() => setPreviewOpen(false)}
        onPrint={handlePrintFromPreview}
      />
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
