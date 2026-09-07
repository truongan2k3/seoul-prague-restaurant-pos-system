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
import { SidebarStatusIcons } from "@/components/connection-status-badge";
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

  const handleTabChange = (tab: NavId) => {
    onTabChange(tab);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      collapseSidebar();
    }
  };

  const expandedWidth = "w-64";
  /** Compact rail on phones/tablets — was 4.25rem and felt oversized. */
  const collapsedWidth = "w-12 lg:w-14";
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
        className={`relative h-full shrink-0 transition-[width] duration-200 ease-out w-12 lg:w-14 ${
          isExpanded ? "lg:w-64" : "lg:w-14"
        }`}
      >
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex h-full flex-col border-r border-gray-200/80 bg-background text-gray-900 transition-[width] duration-200 ease-out dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 lg:static lg:z-auto ${asideWidth}`}
        >
          <div
            className={`flex items-center border-b border-gray-200 dark:border-zinc-800 ${
              isExpanded
                ? "gap-2 px-3 py-2.5 lg:gap-3 lg:px-4 lg:py-4"
                : "justify-center px-1 py-2 lg:px-2 lg:py-3"
            }`}
          >
            {isExpanded ? (
              <div className="flex min-w-0 flex-1 items-center gap-2 lg:gap-3">
                {business?.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={business.logoUrl}
                    alt={business.name}
                    className="h-8 w-8 shrink-0 rounded-lg border border-gray-200 object-cover dark:border-zinc-700 lg:h-11 lg:w-11"
                  />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white lg:h-11 lg:w-11 lg:text-sm">
                    {(business?.name ?? "P").charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-gray-900 dark:text-zinc-100">
                    {business?.name ?? "POS"}
                  </p>
                  <p className="truncate text-[11px] text-gray-500 dark:text-zinc-400 lg:text-xs">
                    {currentStaffUser
                      ? `${currentStaffUser.name} · ${currentStaffUser.role}`
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
                className="h-7 w-7 rounded-md border border-gray-200 object-cover dark:border-zinc-700 lg:h-9 lg:w-9 lg:rounded-lg"
              />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-[10px] font-bold text-white lg:h-9 lg:w-9 lg:rounded-lg lg:text-xs">
                {(business?.name ?? "P").charAt(0)}
              </div>
            )}
            <button
              type="button"
              onClick={toggleCollapsed}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 lg:h-9 lg:w-9 lg:rounded-lg"
              aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
              title={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
            >
              {isExpanded ? (
                <ChevronLeft className="h-4 w-4 lg:h-5 lg:w-5" />
              ) : (
                <ChevronRight className="h-4 w-4 lg:h-5 lg:w-5" />
              )}
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-1 py-2 lg:px-3 lg:py-4">
            <ul className="space-y-0.5 lg:space-y-1">
              {visibleNavItems.map(({ id, labelKey, icon: Icon }) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => handleTabChange(id)}
                    title={translate(labelKey)}
                    className={`${navButtonClass(activeTab === id)} relative min-h-8 px-2 py-1.5 text-xs lg:min-h-[44px] lg:px-3 lg:py-2.5 lg:text-sm ${
                      isExpanded ? "" : "justify-center px-1.5 lg:px-2"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0 lg:h-5 lg:w-5" />
                    {isExpanded && <span className="flex-1 text-left">{translate(labelKey)}</span>}
                    {isExpanded && id === "reservations" && pendingReservationCount > 0 && (
                      <span className="min-w-[1.25rem] rounded-full bg-red-500 px-2 py-0.5 text-center text-xs font-bold text-white">
                        {pendingReservationCount > 99 ? "99+" : pendingReservationCount}
                      </span>
                    )}
                    {!isExpanded && id === "reservations" && pendingReservationCount > 0 && (
                      <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-red-500 lg:right-1 lg:top-1 lg:h-2 lg:w-2" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div
            className={`space-y-1.5 border-t border-gray-200 dark:border-zinc-800 lg:space-y-3 ${
              isExpanded ? "p-2 lg:p-4" : "p-1 lg:p-2"
            }`}
          >
            <SidebarStatusIcons className={isExpanded ? "mb-1" : undefined} />

            <div className="flex justify-center">
              <LanguageSelector variant="flag-menu" />
            </div>

            <button
              type="button"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              title={theme === "light" ? translate("darkMode") : translate("lightMode")}
              className={`flex min-h-8 w-full items-center rounded-md border border-gray-200 bg-gray-50 text-xs text-gray-700 hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 lg:min-h-[44px] lg:rounded-lg lg:text-sm ${
                isExpanded ? "gap-2 px-2 py-1.5 lg:px-3 lg:py-2" : "justify-center px-1 py-1.5 lg:px-2 lg:py-2"
              }`}
            >
              {theme === "light" ? (
                <Moon className="h-3.5 w-3.5 shrink-0 lg:h-4 lg:w-4" />
              ) : (
                <Sun className="h-3.5 w-3.5 shrink-0 lg:h-4 lg:w-4" />
              )}
              {isExpanded && (theme === "light" ? translate("darkMode") : translate("lightMode"))}
            </button>

            <button
              type="button"
              onClick={() => void logout()}
              title={translate("authSignOut")}
              className={`flex min-h-8 w-full items-center rounded-md border border-gray-200 bg-gray-50 text-xs text-gray-700 hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 lg:min-h-[44px] lg:rounded-lg lg:text-sm ${
                isExpanded ? "gap-2 px-2 py-1.5 lg:px-3 lg:py-2" : "justify-center px-1 py-1.5 lg:px-2 lg:py-2"
              }`}
            >
              <LogOut className="h-3.5 w-3.5 shrink-0 lg:h-4 lg:w-4" />
              {isExpanded && translate("authSignOut")}
            </button>

            {isExpanded ? (
              <>
                <button
                  type="button"
                  onClick={openSelfProfile}
                  title={translate("staffSelfProfileTap")}
                  className="flex w-full items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-left transition hover:border-gray-300 hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600 dark:hover:bg-zinc-700 lg:gap-3 lg:rounded-lg lg:px-3 lg:py-2.5"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-700 dark:bg-zinc-600 dark:text-zinc-100 lg:h-9 lg:w-9">
                    <User className="h-4 w-4 lg:h-5 lg:w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium lg:text-sm">
                      {currentStaffUser?.name ?? "—"}
                    </span>
                    {currentStaffUser && (
                      <span className="block truncate text-[10px] uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                        {currentStaffUser.role}
                      </span>
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setQuickSwitchOpen(true)}
                  className="flex min-h-8 w-full items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60 lg:min-h-[44px] lg:rounded-lg lg:px-3 lg:py-2.5 lg:text-sm"
                >
                  <Users className="h-3.5 w-3.5 shrink-0 lg:h-4 lg:w-4" />
                  {translate("staffQuickSwitchButton")}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setQuickSwitchOpen(true)}
                  title={translate("staffQuickSwitchButton")}
                  className="flex h-8 w-full items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 transition hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60 lg:h-10 lg:rounded-lg"
                >
                  <Users className="h-4 w-4 text-emerald-700 dark:text-emerald-300 lg:h-5 lg:w-5" />
                </button>
                <button
                  type="button"
                  onClick={openSelfProfile}
                  title={translate("staffSelfProfileTap")}
                  className="flex h-8 w-full items-center justify-center rounded-md border border-gray-200 bg-gray-50 transition hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 lg:h-10 lg:rounded-lg"
                >
                  <User className="h-4 w-4 text-gray-600 dark:text-zinc-300 lg:h-5 lg:w-5" />
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
      />

      <StaffQuickSwitchModal open={quickSwitchOpen} onClose={() => setQuickSwitchOpen(false)} />
    </>
  );
}
