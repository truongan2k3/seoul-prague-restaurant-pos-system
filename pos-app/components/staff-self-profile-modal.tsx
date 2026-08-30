"use client";

import { Modal } from "@/components/modal";
import { ManagerPasscodeChangeForm } from "@/components/manager-passcode-change-form";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import type { StaffMember } from "@/lib/types";

interface StaffSelfProfileModalProps {
  open: boolean;
  member: StaffMember | null;
  onClose: () => void;
}

export function StaffSelfProfileModal({ open, member, onClose }: StaffSelfProfileModalProps) {
  const { translate } = useApp();
  const { refreshSettings } = useSettings();

  if (!member) return null;

  const isAdmin = member.role === "admin";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={translate("staffSelfProfile")}
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white dark:bg-gray-100 dark:text-gray-900"
          >
            {translate("close")}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-600 dark:bg-gray-900/40">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{member.name}</p>
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{member.role}</p>
        </div>

        {isAdmin ? (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {translate("managerPasscodeChangeTitle")}
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {translate("managerPasscodeChangeHint")}
            </p>
            <ManagerPasscodeChangeForm
              className="mt-4"
              onSuccess={() => void refreshSettings()}
            />
          </div>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-300">{translate("staffSelfProfileHint")}</p>
        )}
      </div>
    </Modal>
  );
}
