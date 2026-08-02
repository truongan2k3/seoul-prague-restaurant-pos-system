"use client";

import { AppProvider, useApp } from "@/contexts/app-context";
import { PinGateProvider } from "@/contexts/pin-gate-context";
import { ReceiptPrintProvider } from "@/contexts/receipt-print-context";
import { NotificationProvider } from "@/contexts/notification-context";
import { SettingsProvider } from "@/contexts/settings-context";
import { ManagerPinModal } from "@/components/manager-pin-modal";

function PinGateWrapper({ children }: { children: React.ReactNode }) {
  const { verifyManagerPin } = useApp();
  return (
    <PinGateProvider verifyPin={verifyManagerPin}>
      {children}
      <ManagerPinModal />
    </PinGateProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <SettingsProvider>
        <NotificationProvider>
          <ReceiptPrintProvider>
            <PinGateWrapper>{children}</PinGateWrapper>
          </ReceiptPrintProvider>
        </NotificationProvider>
      </SettingsProvider>
    </AppProvider>
  );
}
