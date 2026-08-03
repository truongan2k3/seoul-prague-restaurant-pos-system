"use client";

import { AppProvider, useApp } from "@/contexts/app-context";
import { AdminDeletionGateProvider } from "@/contexts/admin-deletion-gate-context";
import { PinGateProvider } from "@/contexts/pin-gate-context";
import { ReceiptPrintProvider } from "@/contexts/receipt-print-context";
import { NotificationProvider } from "@/contexts/notification-context";
import { SettingsProvider, useSettings } from "@/contexts/settings-context";
import { AdminDeletionPasswordModal } from "@/components/admin-deletion-password-modal";
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

function AdminDeletionGateWrapper({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  return (
    <AdminDeletionGateProvider
      verifyPassword={(password) => password === settings.adminDeletionPassword}
    >
      {children}
      <AdminDeletionPasswordModal />
    </AdminDeletionGateProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <SettingsProvider>
        <NotificationProvider>
          <ReceiptPrintProvider>
            <AdminDeletionGateWrapper>
              <PinGateWrapper>{children}</PinGateWrapper>
            </AdminDeletionGateWrapper>
          </ReceiptPrintProvider>
        </NotificationProvider>
      </SettingsProvider>
    </AppProvider>
  );
}
