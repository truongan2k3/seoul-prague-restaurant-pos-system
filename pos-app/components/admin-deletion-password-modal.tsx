"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { ModalOverlay, ModalPanel } from "@/components/modal-overlay";
import { useApp } from "@/contexts/app-context";
import { useAdminDeletionGate } from "@/contexts/admin-deletion-gate-context";

export function AdminDeletionPasswordModal() {
  const { translate } = useApp();
  const { modalOpen, passwordError, submitPassword, cancelDeletion } = useAdminDeletionGate();
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!modalOpen) setPassword("");
  }, [modalOpen]);

  const handleSubmit = () => {
    submitPassword(password);
  };

  const handleCancel = () => {
    cancelDeletion();
  };

  return (
    <ModalOverlay
      open={modalOpen}
      onClose={handleCancel}
      zIndexClass="z-[60]"
      className="flex items-center justify-center p-4"
      backdropClassName="bg-black/50"
    >
      <ModalPanel className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {translate("adminDeletionTitle")}
          </h2>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{translate("adminDeletionPrompt")}</p>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleSubmit();
          }}
          className="pos-input mt-4"
          placeholder={translate("adminDeletionPasswordPlaceholder")}
          autoFocus
        />
        {passwordError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{translate("invalidAdminPassword")}</p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-800 dark:border-gray-600 dark:text-gray-200"
          >
            {translate("cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white hover:bg-red-700"
          >
            {translate("confirmDelete")}
          </button>
        </div>
      </ModalPanel>
    </ModalOverlay>
  );
}
