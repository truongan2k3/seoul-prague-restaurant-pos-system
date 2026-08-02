"use client";

import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  History,
  Languages,
  Map,
  Moon,
  Package,
  Settings,
  Sun,
  User,
  Users,
} from "lucide-react";
import { LanguageSelector } from "@/components/language-selector";
import { useApp } from "@/contexts/app-context";
import { canManageStaff } from "@/lib/staff-roles";
import { navButtonClass } from "@/lib/theme-classes";
import type { NavId } from "@/lib/types";

export const navItems = [
  { id: "map" as const, labelKey: "map" as const, icon: Map },
  { id: "order" as const, labelKey: "order" as const, icon: ClipboardList },
  { id: "reservations" as const, labelKey: "reservations" as const, icon: CalendarDays },
  { id: "history" as const, labelKey: "history" as const, icon: History, adminOnly: true },
  { id: "summary" as const, labelKey: "summary" as const, icon: BarChart3 },
  { id: "storage" as const, labelKey: "storage" as const, icon: Package },
  { id: "staff" as const, labelKey: "staffManagement" as const, icon: Users, adminOnly: true },
  { id: "settings" as const, labelKey: "settings" as const, icon: Settings },
] as const;

interface SidebarProps {
  activeTab: NavId;
  onTabChange: (tab: NavId) => void;
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { theme, setTheme, currentStaffUser, setStaff, staffList, translate, canManageStaff } =
    useApp();

  const visibleNavItems = navItems.filter(
    (item) => !("adminOnly" in item && item.adminOnly) || canManageStaff,
  );

  const activeStaffOptions = staffList.filter((member) => member.active);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-gray-200 bg-white text-gray-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
      <div className="border-b border-gray-200 px-4 py-4 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-zinc-500">
          Windows POS
        </p>
        <p className="mt-1 text-sm font-medium text-gray-800 dark:text-zinc-200">Cashier & Floor</p>
      </div>

      <nav className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {visibleNavItems.map(({ id, labelKey, icon: Icon }) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => onTabChange(id)}
                className={navButtonClass(activeTab === id)}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {translate(labelKey)}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-4 border-t border-gray-200 p-4 dark:border-zinc-800">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-zinc-500">
            <Languages className="h-4 w-4" />
            {translate("language")}
          </div>
          <LanguageSelector variant="sidebar" />
        </div>

        <button
          type="button"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          {theme === "light" ? translate("darkMode") : translate("lightMode")}
        </button>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-zinc-500">
            {translate("staff")}
          </label>
          <select
            value={currentStaffUser?.id ?? ""}
            onChange={(e) => {
              const member = staffList.find((s) => s.id === e.target.value);
              if (member) setStaff(member);
            }}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          >
            {activeStaffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-800">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-700 dark:bg-zinc-600 dark:text-zinc-100">
            <User className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <span className="block truncate text-sm font-medium">{currentStaffUser?.name ?? "—"}</span>
            {currentStaffUser && (
              <span className="block truncate text-[10px] uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                {currentStaffUser.role}
              </span>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
