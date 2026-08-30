"use client";

import { AppProvider, useApp } from "@/contexts/app-context";
import { AuthProvider } from "@/contexts/auth-context";
import { PinGateProvider } from "@/contexts/pin-gate-context";
import { staffBypassesManagerPasscode } from "@/lib/staff-roles";
import { ReceiptPrintProvider } from "@/contexts/receipt-print-context";
import { NotificationProvider } from "@/contexts/notification-context";
import { SettingsProvider, useSettings } from "@/contexts/settings-context";
import { ManagerPasscodeModal } from "@/components/manager-passcode-modal";
import { FullscreenToggle } from "@/components/fullscreen-toggle";
import { MobileRefreshGuard } from "@/components/mobile-refresh-guard";
import { UnsavedWorkProvider } from "@/contexts/unsaved-work-context";
import { AdminBroadcastListener } from "@/components/admin-broadcast-listener";
import { PagePresenceTracker } from "@/components/page-presence-tracker";

function PinGateWrapper({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const { currentStaffUser } = useApp();
  return (
    <PinGateProvider
      verifyPin={(passcode) => passcode === settings.adminDeletionPassword}
      bypassPin={staffBypassesManagerPasscode(currentStaffUser?.role)}
    >
      <UnsavedWorkProvider>
        {children}
        <AdminBroadcastListener />
        <PagePresenceTracker />
        <MobileRefreshGuard />
        <FullscreenToggle variant="fab" />
      </UnsavedWorkProvider>
      <ManagerPasscodeModal />
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
