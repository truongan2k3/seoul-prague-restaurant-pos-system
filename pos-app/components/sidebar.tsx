"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  History,
  LogOut,
  Map,
  Moon,
  Package,
  QrCode,
  Settings,
  Sun,
  User,
  Users,
} from "lucide-react";
import { LanguageSelector } from "@/components/language-selector";
import { StaffSelfProfileModal } from "@/components/staff-self-profile-modal";
import { StaffQuickSwitchModal } from "@/components/staff-quick-switch-modal";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { usePendingReservationCount } from "@/hooks/use-pending-reservation-count";
import { useNotifications } from "@/contexts/notification-context";
import { navButtonClass } from "@/lib/theme-classes";
import { canAccessNavTabForMember } from "@/lib/staff-roles";
import type { NavId } from "@/lib/types";
import { updateStaffSelfProfile, type StaffSelfProfileInput } from "@/src/lib/staff-actions";

const SIDEBAR_COLLAPSED_KEY = "pos-sidebar-collapsed";

export const navItems = [
  { id: "map" as const, labelKey: "map" as const, icon: Map },
  { id: "order" as const, labelKey: "order" as const, icon: ClipboardList },
  { id: "reservations" as const, labelKey: "reservations" as const, icon: CalendarDays },
  { id: "history" as const, labelKey: "history" as const, icon: History },
  { id: "summary" as const, labelKey: "summary" as const, icon: BarChart3 },
  { id: "storage" as const, labelKey: "storage" as const, icon: Package },
  { id: "dynamicQr" as const, labelKey: "dynamicQrServices" as const, icon: QrCode },
  { id: "staff" as const, labelKey: "staffManagement" as const, icon: Users },
  { id: "settings" as const, labelKey: "settings" as const, icon: Settings },
] as const;

interface SidebarProps {
  activeTab: NavId;
  onTabChange: (tab: NavId) => void;
}

function readCollapsedPreference(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const {
    theme,
    setTheme,
    currentStaffUser,
    staffList,
    setStaff,
    refreshStaffList,
    translate,
  } = useApp();
  const { pushNotification } = useNotifications();
  const { business, session, logout } = useAuth();
  const pendingReservationCount = usePendingReservationCount();
  const [collapsed, setCollapsed] = useState(false);
  const [selfProfileOpen, setSelfProfileOpen] = useState(false);
  const [quickSwitchOpen, setQuickSwitchOpen] = useState(false);
  const [selfProfileSaving, setSelfProfileSaving] = useState(false);

  useEffect(() => {
    setCollapsed(readCollapsedPreference());
  }, []);

  const visibleNavItems = navItems.filter((item) =>
    canAccessNavTabForMember(currentStaffUser, item.id),
  );

  const isExpanded = !collapsed;

  const persistCollapsed = (value: boolean) => {
    setCollapsed(value);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(value));
  };

  const toggleCollapsed = () => {
    persistCollapsed(!collapsed);
  };

  const collapseSidebar = () => {
    persistCollapsed(true);
  };

  const openSelfProfile = () => {
    if (!currentStaffUser) return;
    setSelfProfileOpen(true);
  };

  const handleSaveSelfProfile = async (input: StaffSelfProfileInput) => {
    if (!currentStaffUser) return;
    setSelfProfileSaving(true);
    const { data, error } = await updateStaffSelfProfile(currentStaffUser.id, currentStaffUser, input);
    setSelfProfileSaving(false);
    if (error) {
      pushNotification({ message: error.message, playSound: false });
      throw error;
    }
    await refreshStaffList();
    if (data) {
      setStaff(data);
    }
    setSelfProfileOpen(false);
    pushNotification({ message: translate("settingsSavedSuccess"), playSound: false });
  };

  const handleTabChange = (tab: NavId) => {
    onTabChange(tab);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      collapseSidebar();
    }
  };

  const expandedWidth = "w-64";
  const collapsedWidth = "w-[4.25rem]";
  const asideWidth = isExpanded ? expandedWidth : collapsedWidth;

  return (
    <>
      {isExpanded && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={collapseSidebar}
        />
      )}

      <div
        className={`relative h-full shrink-0 transition-[width] duration-200 ease-out w-[4.25rem] ${
          isExpanded ? "lg:w-64" : "lg:w-[4.25rem]"
        }`}
      >
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex h-full flex-col border-r border-gray-200 bg-white text-gray-900 transition-[width] duration-200 ease-out dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 lg:static lg:z-auto ${asideWidth}`}
        >
          <div
            className={`flex items-center border-b border-gray-200 dark:border-zinc-800 ${
              isExpanded ? "gap-3 px-4 py-4" : "justify-center px-2 py-3"
            }`}
          >
            {isExpanded ? (
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {business?.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={business.logoUrl}
                    alt={business.name}
                    className="h-11 w-11 shrink-0 rounded-lg border border-gray-200 object-cover dark:border-zinc-700"
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">
                    {(business?.name ?? "P").charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-gray-900 dark:text-zinc-100">
                    {business?.name ?? "POS"}
                  </p>
                  <p className="truncate text-xs text-gray-500 dark:text-zinc-400">
                    {currentStaffUser
                      ? `${currentStaffUser.name}${currentStaffUser.username ? ` · @${currentStaffUser.username}` : ""} · ${currentStaffUser.role}`
                      : session?.username
                        ? `@${session.username} (${translate("staffLoginTitle")})`
                        : translate("cashierFloor")}
                  </p>
                </div>
              </div>
            ) : business?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={business.logoUrl}
                alt={business.name}
                className="h-9 w-9 rounded-lg border border-gray-200 object-cover dark:border-zinc-700"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white">
                {(business?.name ?? "P").charAt(0)}
              </div>
            )}
            <button
              type="button"
              onClick={toggleCollapsed}
              className="touch-target flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800"
              aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
              title={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
            >
              {isExpanded ? (
                <ChevronLeft className="h-5 w-5" />
              ) : (
                <ChevronRight className="h-5 w-5" />
              )}
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-2 py-4 lg:px-3">
            <ul className="space-y-1">
              {visibleNavItems.map(({ id, labelKey, icon: Icon }) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => handleTabChange(id)}
                    title={translate(labelKey)}
                    className={`${navButtonClass(activeTab === id)} relative min-h-[44px] ${
                      isExpanded ? "" : "justify-center px-2"
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {isExpanded && <span className="flex-1 text-left">{translate(labelKey)}</span>}
                    {isExpanded && id === "reservations" && pendingReservationCount > 0 && (
                      <span className="min-w-[1.25rem] rounded-full bg-red-500 px-2 py-0.5 text-center text-xs font-bold text-white">
                        {pendingReservationCount > 99 ? "99+" : pendingReservationCount}
                      </span>
                    )}
                    {!isExpanded && id === "reservations" && pendingReservationCount > 0 && (
                      <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div
            className={`space-y-3 border-t border-gray-200 dark:border-zinc-800 ${
              isExpanded ? "p-4" : "p-2"
            }`}
          >
            <div className="flex justify-center">
              <LanguageSelector variant="flag-menu" />
            </div>

            <button
              type="button"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              title={theme === "light" ? translate("darkMode") : translate("lightMode")}
              className={`flex min-h-[44px] w-full items-center rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 ${
                isExpanded ? "gap-2 px-3 py-2" : "justify-center px-2 py-2"
              }`}
            >
              {theme === "light" ? (
                <Moon className="h-4 w-4 shrink-0" />
              ) : (
                <Sun className="h-4 w-4 shrink-0" />
              )}
              {isExpanded && (theme === "light" ? translate("darkMode") : translate("lightMode"))}
            </button>

            <button
              type="button"
              onClick={() => void logout()}
              title={translate("authSignOut")}
              className={`flex min-h-[44px] w-full items-center rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 ${
                isExpanded ? "gap-2 px-3 py-2" : "justify-center px-2 py-2"
              }`}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {isExpanded && translate("authSignOut")}
            </button>

            {isExpanded ? (
              <>
                <button
                  type="button"
                  onClick={openSelfProfile}
                  title={translate("staffSelfProfileTap")}
                  className="flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-left transition hover:border-gray-300 hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600 dark:hover:bg-zinc-700"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-700 dark:bg-zinc-600 dark:text-zinc-100">
                    <User className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {currentStaffUser?.name ?? "—"}
                    </span>
                    {currentStaffUser && (
                      <span className="block truncate text-[10px] uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                        {currentStaffUser.username ? `@${currentStaffUser.username}` : currentStaffUser.role}
                      </span>
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setQuickSwitchOpen(true)}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60"
                >
                  <Users className="h-4 w-4 shrink-0" />
                  {translate("staffQuickSwitchButton")}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setQuickSwitchOpen(true)}
                  title={translate("staffQuickSwitchButton")}
                  className="flex h-10 w-full items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 transition hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60"
                >
                  <Users className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
                </button>
                <button
                  type="button"
                  onClick={openSelfProfile}
                  title={translate("staffSelfProfileTap")}
                  className="flex h-10 w-full items-center justify-center rounded-lg border border-gray-200 bg-gray-50 transition hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                >
                  <User className="h-5 w-5 text-gray-600 dark:text-zinc-300" />
                </button>
              </>
            )}
          </div>
        </aside>
      </div>

      <StaffSelfProfileModal
        open={selfProfileOpen}
        member={currentStaffUser}
        onClose={() => setSelfProfileOpen(false)}
        onSave={handleSaveSelfProfile}
        isSaving={selfProfileSaving}
      />

      <StaffQuickSwitchModal open={quickSwitchOpen} onClose={() => setQuickSwitchOpen(false)} />
    </>
  );
}
