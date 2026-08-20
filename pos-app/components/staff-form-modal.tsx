"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import {
  ALL_NAV_TABS,
  STAFF_ROLES,
  defaultNavTabsForRole,
  parseAllowedNav,
} from "@/lib/staff-roles";
import type { NavId, StaffMember, StaffRole } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { StaffInput } from "@/src/lib/staff-actions";

const NAV_LABEL_KEYS: Record<NavId, TranslationKey> = {
  map: "map",
  order: "order",
  reservations: "reservations",
  history: "history",
  summary: "summary",
  storage: "storage",
  dynamicQr: "dynamicQrServices",
  staff: "staffManagement",
  settings: "settings",
};

const emptyForm = (): StaffInput => ({
  name: "",
  username: "",
  password: "",
  role: "server",
  active: true,
  allowedNav: defaultNavTabsForRole("server"),
});

interface StaffFormModalProps {
  open: boolean;
  member?: StaffMember | null;
  canDelete?: boolean;
  onClose: () => void;
  onSave: (input: StaffInput) => Promise<void>;
  onDelete?: () => Promise<void>;
  isSaving?: boolean;
}

const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Admin",
  manager: "Manager",
  server: "Server",
  kitchen: "Kitchen",
  bar: "Bar",
};

export function StaffFormModal({
  open,
  member,
  canDelete = false,
  onClose,
  onSave,
  onDelete,
  isSaving = false,
}: StaffFormModalProps) {
  const { translate } = useApp();
  const [form, setForm] = useState<StaffInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (member) {
      setForm({
        name: member.name,
        username: member.username ?? "",
        password: "",
        role: member.role,
        active: member.active,
        allowedNav: member.allowedNav?.length
          ? [...member.allowedNav]
          : defaultNavTabsForRole(member.role),
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, member]);

  const toggleNav = (tab: NavId) => {
    setForm((prev) => {
      const has = prev.allowedNav.includes(tab);
      const next = has ? prev.allowedNav.filter((id) => id !== tab) : [...prev.allowedNav, tab];
      return { ...prev, allowedNav: next.length > 0 ? next : ["map"] };
    });
  };

  const handleRoleChange = (role: StaffRole) => {
    setForm((prev) => ({
      ...prev,
      role,
      allowedNav: defaultNavTabsForRole(role),
    }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError(translate("staffNameRequired"));
      return;
    }
    if (!form.username.trim()) {
      setError(translate("staffUsernameRequired"));
      return;
    }
    if (!member && !form.password?.trim()) {
      setError(translate("staffPasswordRequired"));
      return;
    }
    if (form.password?.trim() && form.password.trim().length < 4) {
      setError(translate("staffPasswordTooShort"));
      return;
    }
    if (form.allowedNav.length === 0) {
      setError(translate("staffNavRequired"));
      return;
    }
    setError(null);
    await onSave({
      ...form,
      allowedNav: parseAllowedNav(form.allowedNav) ?? defaultNavTabsForRole(form.role),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={member ? translate("staffEditMember") : translate("staffNewMember")}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {member && onDelete && canDelete ? (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void onDelete()}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
            >
              {translate("delete")}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-800 dark:border-gray-600 dark:text-gray-200"
            >
              {translate("cancel")}
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void handleSubmit()}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
            >
              {isSaving ? translate("settingsSaving") : translate("save")}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <label className="block">
          <span className="pos-label">{translate("staffName")}</span>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="pos-input mt-1"
            placeholder={translate("staffNamePlaceholder")}
          />
        </label>

        <label className="block">
          <span className="pos-label">{translate("staffRole")}</span>
          <select
            value={form.role}
            onChange={(e) => handleRoleChange(e.target.value as StaffRole)}
            className="pos-input mt-1"
          >
            {STAFF_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="pos-label">{translate("staffUsername")}</span>
          <input
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            className="pos-input mt-1"
            autoComplete="off"
            placeholder={translate("staffUsernamePlaceholder")}
          />
        </label>

        <label className="block">
          <span className="pos-label">{translate("staffPassword")}</span>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {member ? translate("staffPasswordEditHint") : translate("staffPasswordCreateHint")}
          </p>
          <input
            type="password"
            value={form.password ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className="pos-input mt-1"
            autoComplete="new-password"
            placeholder="••••••"
          />
        </label>

        <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-3 dark:border-gray-600">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300"
          />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {translate("active")}
          </span>
        </label>

        <div className="rounded-lg border border-gray-200 px-3 py-3 dark:border-gray-600">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {translate("staffAllowedTabs")}
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {translate("staffAllowedTabsHint")}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {ALL_NAV_TABS.map((tab) => (
              <label
                key={tab}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-gray-700"
              >
                <input
                  type="checkbox"
                  checked={form.allowedNav.includes(tab)}
                  onChange={() => toggleNav(tab)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-gray-800 dark:text-gray-200">{translate(NAV_LABEL_KEYS[tab])}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
