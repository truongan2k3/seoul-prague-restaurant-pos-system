"use client";

import { AppProvider, useApp } from "@/contexts/app-context";
import { AuthProvider } from "@/contexts/auth-context";
import { PinGateProvider } from "@/contexts/pin-gate-context";
import { canManageStaff } from "@/lib/staff-roles";
import { ReceiptPrintProvider } from "@/contexts/receipt-print-context";
import { NotificationProvider } from "@/contexts/notification-context";
import { SettingsProvider, useSettings } from "@/contexts/settings-context";
import { ManagerPasscodeModal } from "@/components/manager-passcode-modal";
import { FullscreenToggle } from "@/components/fullscreen-toggle";
import { StaffSwitchModal } from "@/components/staff-switch-modal";
import { MobileRefreshGuard } from "@/components/mobile-refresh-guard";
import { UnsavedWorkProvider } from "@/contexts/unsaved-work-context";

function PinGateWrapper({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const { currentStaffUser } = useApp();
  return (
    <PinGateProvider
      verifyPin={(passcode) => passcode === settings.adminDeletionPassword}
      bypassPin={canManageStaff(currentStaffUser?.role)}
    >
      <UnsavedWorkProvider>
        {children}
        <MobileRefreshGuard />
        <FullscreenToggle variant="fab" />
      </UnsavedWorkProvider>
      <ManagerPasscodeModal />
      <StaffSwitchModal />
    </PinGateProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppProvider>
        <SettingsProvider>
          <NotificationProvider>
            <ReceiptPrintProvider>
              <PinGateWrapper>{children}</PinGateWrapper>
            </ReceiptPrintProvider>
          </NotificationProvider>
        </SettingsProvider>
      </AppProvider>
    </AuthProvider>
  );
}
