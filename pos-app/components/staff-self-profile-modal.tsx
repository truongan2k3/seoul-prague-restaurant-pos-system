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
  const [pin, setPin] = useState("");
  const [requireSwitchPassword, setRequireSwitchPassword] = useState(false);
  const [requirePinForActions, setRequirePinForActions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !member) return;
    setError(null);
    setPin(member.pin ?? "");
    setRequireSwitchPassword(member.requireSwitchPassword ?? false);
    setRequirePinForActions(member.requirePinForActions ?? false);
  }, [open, member]);

  if (!member) return null;

  const handleSubmit = async () => {
    if (pin && !/^\d{4}$/.test(pin)) {
      setError(translate("staffPinInvalid"));
      return;
    }
    if (requireSwitchPassword && !pin) {
      setError(translate("staffSwitchPasswordRequired"));
      return;
    }
    setError(null);
    await onSave({ pin, requireSwitchPassword, requirePinForActions });
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

        <label className="block">
          <span className="pos-label">{translate("staffPin")}</span>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {translate("staffPinSessionHint")}
          </p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            className="pos-input mt-1 tracking-[0.4em]"
            placeholder="••••"
            autoComplete="new-password"
          />
        </label>

        <div className="rounded-lg border border-gray-200 px-3 py-3 dark:border-gray-600">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {translate("staffPermissions")}
          </p>

          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-gray-100 px-3 py-3 dark:border-gray-700">
            <input
              type="checkbox"
              checked={requireSwitchPassword}
              onChange={(e) => setRequireSwitchPassword(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300"
            />
            <span>
              <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                {translate("staffRequireSwitchPassword")}
              </span>
              <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                {translate("staffRequireSwitchPasswordHint")}
              </span>
            </span>
          </label>

          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-gray-100 px-3 py-3 dark:border-gray-700">
            <input
              type="checkbox"
              checked={requirePinForActions}
              onChange={(e) => setRequirePinForActions(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300"
            />
            <span>
              <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                {translate("staffRequirePinForActions")}
              </span>
              <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                {translate("staffRequirePinForActionsHint")}
              </span>
            </span>
          </label>
        </div>
      </div>
    </Modal>
  );
}
