"use client";

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
}: StaffSelfProfileModalProps) {
  const { translate } = useApp();

  if (!member) return null;

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
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">{translate("staffSelfProfileHint")}</p>
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-600 dark:bg-gray-900/40">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{member.name}</p>
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{member.role}</p>
        </div>
      </div>
    </Modal>
  );
}
