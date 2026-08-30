"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ModalOverlay, ModalPanel } from "@/components/modal-overlay";
import { useApp } from "@/contexts/app-context";

interface StaffAdminPasscodeModalProps {
  open: boolean;
  staffName: string;
  submitting?: boolean;
  error?: boolean;
  onConfirm: (passcode: string) => void;
  onCancel: () => void;
}

export function StaffAdminPasscodeModal({
  open,
  staffName,
  submitting = false,
  error = false,
  onConfirm,
  onCancel,
}: StaffAdminPasscodeModalProps) {
  const { translate } = useApp();
  const [passcode, setPasscode] = useState("");

  useEffect(() => {
    if (!open) setPasscode("");
  }, [open]);

  const handleSubmit = () => {
    if (!passcode.trim() || submitting) return;
    onConfirm(passcode.trim());
  };

  return (
    <ModalOverlay
      open={open}
      onClose={onCancel}
      zIndexClass="z-[60]"
      className="flex items-center justify-center p-4"
      backdropClassName="bg-black/50"
    >
      <ModalPanel className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {translate("managerPasscodeTitle")}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {translate("staffLoginAdminPasscodePrompt").replace("{name}", staffName)}
        </p>
        <input
          type="password"
          value={passcode}
          onChange={(event) => setPasscode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleSubmit();
          }}
          className="pos-input mt-4"
          placeholder={translate("managerPasscodePlaceholder")}
          autoFocus
          disabled={submitting}
        />
        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {translate("managerPasscodeInvalid")}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-800 dark:border-gray-600 dark:text-gray-200"
          >
            {translate("cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!passcode.trim() || submitting}
            className="flex-1 rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-gray-100 dark:text-gray-900"
          >
            {submitting ? translate("authSigningIn") : translate("confirm")}
          </button>
        </div>
      </ModalPanel>
    </ModalOverlay>
  );
}
