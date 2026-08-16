"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { ReceiptPreviewModal } from "@/components/receipt-preview-modal";
import { settingsToReceiptBusiness, settingsToReceiptTemplate } from "@/src/components/ReceiptPrint";
import { printReceiptData } from "@/src/lib/printReceipt";
import { printKitchenMessage, printKitchenTicket } from "@/src/lib/printKitchenTicket";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import {
  buildReceiptData,
  buildTestReceiptData,
  type ReceiptData,
} from "@/lib/receipt-calculations";
import type { CheckoutPaymentRecord } from "@/lib/checkout-calculations";
import type { MenuItem, OrderItem } from "@/lib/types";
import { broadcastKitchenPrintMessage } from "@/lib/pos-notifications";
import { translateNoteToChineseAction } from "@/src/lib/translate-actions";

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
  printKitchenOrder: (input: {
    tableLabel: string;
    orders: OrderItem[];
    menuItems: MenuItem[];
  }) => Promise<void>;
  printKitchenStaffMessage: (input: {
    tableLabel?: string;
    message: string;
    messageZh?: string;
  }) => Promise<void>;
}

const ReceiptPrintContext = createContext<ReceiptPrintContextValue | null>(null);

export function ReceiptPrintProvider({ children }: { children: ReactNode }) {
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { receiptShowUsd, usdRate } = useApp();
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
        showEur: settings.showEurCurrency,
        showUsd: receiptShowUsd,
        eurRate: settings.eurExchangeRate,
        usdRate,
        business,
      });
      setReceiptData(data);
      void printReceiptData(data, template, {
        receiptFontSize: settings.receiptFontSize,
        receiptFontWeight: settings.receiptFontWeight,
        receiptFontFamily: settings.receiptFontFamily,
        receiptPrintBitmap: settings.receiptPrintBitmap,
        silentPrintEnabled: settings.silentPrintEnabled,
        printBridgeUrl: settings.printBridgeUrl,
        browserPrintFallback: settings.browserPrintFallback,
        printers: settings.printers,
      });
    },
    [
      settings.showEurCurrency,
      settings.eurExchangeRate,
      settings.receiptFontSize,
      settings.receiptFontWeight,
      settings.receiptFontFamily,
      settings.receiptPrintBitmap,
      settings.silentPrintEnabled,
      settings.printBridgeUrl,
      settings.browserPrintFallback,
      settings.printers,
      receiptShowUsd,
      usdRate,
      business,
      template,
    ],
  );

  const printTestReceipt = useCallback(() => {
    openReceiptPreview(buildTestReceiptData(business));
  }, [business, openReceiptPreview]);

  const printKitchenOrder = useCallback(
    async (input: { tableLabel: string; orders: OrderItem[]; menuItems: MenuItem[] }) => {
      await printKitchenTicket({
        tableLabel: input.tableLabel,
        orders: input.orders,
        menuItems: input.menuItems,
        settings,
      });
    },
    [settings],
  );

  const printKitchenStaffMessage = useCallback(
    async (input: { tableLabel?: string; message: string; messageZh?: string }) => {
      const messageZh =
        input.messageZh?.trim() || (await translateNoteToChineseAction(input.message));
      const tableLabel = input.tableLabel?.trim();
      if (settings.kitchenPrintViaStation) {
        await broadcastKitchenPrintMessage({
          tableLabel,
          message: input.message,
          messageZh,
        });
        return;
      }
      await printKitchenMessage({
        tableLabel,
        message: input.message,
        messageZh,
        settings,
      });
    },
    [settings],
  );

  const handlePrintFromPreview = useCallback(() => {
    setPreviewOpen(false);
    if (receiptData) {
      void printReceiptData(receiptData, template, {
        receiptFontSize: settings.receiptFontSize,
        receiptFontWeight: settings.receiptFontWeight,
        receiptFontFamily: settings.receiptFontFamily,
        receiptPrintBitmap: settings.receiptPrintBitmap,
        silentPrintEnabled: settings.silentPrintEnabled,
        printBridgeUrl: settings.printBridgeUrl,
        browserPrintFallback: settings.browserPrintFallback,
        printers: settings.printers,
      });
    }
  }, [
    receiptData,
    template,
    settings.receiptFontSize,
    settings.receiptFontWeight,
    settings.receiptFontFamily,
    settings.receiptPrintBitmap,
    settings.silentPrintEnabled,
    settings.printBridgeUrl,
    settings.browserPrintFallback,
    settings.printers,
  ]);

  return (
    <ReceiptPrintContext.Provider
      value={{
        printReceipt,
        printTestReceipt,
        openReceiptPreview,
        printKitchenOrder,
        printKitchenStaffMessage,
      }}
    >
      {children}
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
