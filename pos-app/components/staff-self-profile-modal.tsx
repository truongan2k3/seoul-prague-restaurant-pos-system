"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import type { StaffMember } from "@/lib/types";
import type { StaffSelfProfileInput } from "@/src/lib/staff-actions";

interface StaffSelfProfileModalProps {
  open: boolean;
  member: StaffMember | null;
  onClose: () => void;
  onSave: (input: StaffSelfProfileInput) => Promise<void>;
  isSaving?: boolean;
}

export function StaffSelfProfileModal({
  open,
  member,
  onClose,
  onSave,
  isSaving = false,
}: StaffSelfProfileModalProps) {
  const { translate } = useApp();
  const [username, setUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isAdmin = member?.role === "admin";

  useEffect(() => {
    if (!open || !member) return;
    setError(null);
    setUsername(member.username ?? "");
    setCurrentPassword("");
    setNewPassword("");
  }, [open, member]);

  if (!member) return null;

  const handleSubmit = async () => {
    if (newPassword.trim() && !currentPassword.trim()) {
      setError(translate("staffCurrentPasswordRequired"));
      return;
    }
    if (newPassword.trim() && newPassword.trim().length < 4) {
      setError(translate("staffPasswordTooShort"));
      return;
    }
    if (isAdmin && !username.trim()) {
      setError(translate("staffUsernameRequired"));
      return;
    }
    setError(null);
    await onSave({
      currentPassword: currentPassword.trim() || undefined,
      newPassword: newPassword.trim() || undefined,
      newUsername: isAdmin ? username.trim() : undefined,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={translate("staffSelfProfile")}
      footer={
        <div className="flex justify-end gap-2">
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
      }
    >
      <div className="space-y-4">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <p className="text-sm text-gray-600 dark:text-gray-300">{translate("staffSelfProfileHint")}</p>

        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-600 dark:bg-gray-900/40">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{member.name}</p>
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{member.role}</p>
        </div>

        {isAdmin && (
          <label className="block">
            <span className="pos-label">{translate("staffUsername")}</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="pos-input mt-1"
              autoComplete="username"
            />
          </label>
        )}

        <div className="rounded-lg border border-gray-200 px-3 py-3 dark:border-gray-600">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {translate("staffChangePassword")}
          </p>
          <label className="mt-3 block">
            <span className="pos-label">{translate("staffCurrentPassword")}</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="pos-input mt-1"
              autoComplete="current-password"
            />
          </label>
          <label className="mt-3 block">
            <span className="pos-label">{translate("staffNewPassword")}</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pos-input mt-1"
              autoComplete="new-password"
            />
          </label>
        </div>
      </div>
    </Modal>
  );
}
