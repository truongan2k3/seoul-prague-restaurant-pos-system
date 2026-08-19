"use client";

import { AppProvider, useApp } from "@/contexts/app-context";
import { AuthProvider } from "@/contexts/auth-context";
import { AdminDeletionGateProvider } from "@/contexts/admin-deletion-gate-context";
import { PinGateProvider } from "@/contexts/pin-gate-context";
import { staffBypassesPinGate } from "@/lib/staff-roles";
import { ReceiptPrintProvider } from "@/contexts/receipt-print-context";
import { NotificationProvider } from "@/contexts/notification-context";
import { SettingsProvider, useSettings } from "@/contexts/settings-context";
import { AdminDeletionPasswordModal } from "@/components/admin-deletion-password-modal";
import { FullscreenToggle } from "@/components/fullscreen-toggle";
import { ManagerPinModal } from "@/components/manager-pin-modal";
import { StaffSwitchModal } from "@/components/staff-switch-modal";
import { MobileRefreshGuard } from "@/components/mobile-refresh-guard";
import { UnsavedWorkProvider } from "@/contexts/unsaved-work-context";

function PinGateWrapper({ children }: { children: React.ReactNode }) {
  const { verifyManagerPin, currentStaffUser } = useApp();
  return (
    <PinGateProvider
      verifyPin={verifyManagerPin}
      bypassPin={staffBypassesPinGate(currentStaffUser)}
    >
      {children}
      <ManagerPinModal />
      <StaffSwitchModal />
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
    <AuthProvider>
      <AppProvider>
        <SettingsProvider>
          <NotificationProvider>
            <ReceiptPrintProvider>
            <AdminDeletionGateWrapper>
              <UnsavedWorkProvider>
                <PinGateWrapper>
                  {children}
                  <MobileRefreshGuard />
                  <FullscreenToggle variant="fab" />
                </PinGateWrapper>
              </UnsavedWorkProvider>
            </AdminDeletionGateWrapper>
            </ReceiptPrintProvider>
          </NotificationProvider>
        </SettingsProvider>
      </AppProvider>
    </AuthProvider>
  );
}
