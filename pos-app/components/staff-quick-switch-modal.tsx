"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ModalOverlay, ModalPanel } from "@/components/modal-overlay";
import { StaffAdminPasscodeModal } from "@/components/staff-admin-passcode-modal";
import { useApp } from "@/contexts/app-context";
import { switchStaffAction } from "@/src/lib/staff-auth-actions";
import type { StaffMember } from "@/lib/types";

interface StaffQuickSwitchModalProps {
  open: boolean;
  onClose: () => void;
}

export function StaffQuickSwitchModal({ open, onClose }: StaffQuickSwitchModalProps) {
  const { translate, staffList, currentStaffUser, refreshStaffList, setStaff } = useApp();
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [adminPasscodeTarget, setAdminPasscodeTarget] = useState<StaffMember | null>(null);
  const [passcodeError, setPasscodeError] = useState(false);

  const activeStaff = staffList.filter((member) => member.active);

  useEffect(() => {
    if (!open) {
      setSubmittingId(null);
      setError(false);
      setAdminPasscodeTarget(null);
      setPasscodeError(false);
    }
  }, [open]);

  const completeSwitch = async (member: StaffMember, managerPasscode?: string) => {
    setSubmittingId(member.id);
    setError(false);
    setPasscodeError(false);
    const result = await switchStaffAction(member.id, managerPasscode);
    setSubmittingId(null);

    if (
      result.error === "invalidManagerPasscode" ||
      result.error === "managerPasscodeRequired"
    ) {
      setPasscodeError(true);
      return;
    }

    if (!result.ok) {
      setAdminPasscodeTarget(null);
      setError(true);
      return;
    }

    if (result.member) {
      setStaff(result.member);
    }
    await refreshStaffList();
    setAdminPasscodeTarget(null);
    onClose();
  };

  const handleSelect = async (member: StaffMember) => {
    if (submittingId) return;
    if (member.id === currentStaffUser?.id) {
      onClose();
      return;
    }
    if (member.role === "admin") {
      setPasscodeError(false);
      setAdminPasscodeTarget(member);
      return;
    }
    await completeSwitch(member);
  };

  return (
    <>
      <ModalOverlay
        open={open}
        onClose={onClose}
        zIndexClass="z-[60]"
        className="flex items-end justify-center p-2 sm:items-center sm:p-4"
        backdropClassName="bg-black/50"
      >
        <ModalPanel className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
          <div className="shrink-0 p-4 pb-2 sm:p-6 sm:pb-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {translate("staffQuickSwitchTitle")}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{translate("staffQuickSwitchHint")}</p>

            <div className="mt-4 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-1 dark:border-gray-600">
              {activeStaff.map((member) => {
                const isCurrent = member.id === currentStaffUser?.id;
                const isBusy = submittingId === member.id;
                return (
                  <button
                    key={member.id}
                    type="button"
                    disabled={submittingId != null}
                    onClick={() => void handleSelect(member)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${
                      isCurrent
                        ? "bg-emerald-600 text-white"
                        : "text-gray-800 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                    } disabled:opacity-60`}
                  >
                    <span className="font-medium">{member.name}</span>
                    <span className={`text-xs uppercase ${isCurrent ? "text-emerald-100" : "text-gray-500"}`}>
                      {isBusy
                        ? translate("authSigningIn")
                        : isCurrent
                          ? translate("staffQuickSwitchCurrent")
                          : member.role}
                    </span>
                  </button>
                );
              })}
            </div>

            {error && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                {translate("staffLoginInvalid")}
              </p>
            )}

            <div className="mt-4">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-800 dark:border-gray-600 dark:text-gray-200"
              >
                {translate("cancel")}
              </button>
            </div>
          </div>
        </ModalPanel>
      </ModalOverlay>

      <StaffAdminPasscodeModal
        open={adminPasscodeTarget != null}
        staffName={adminPasscodeTarget?.name ?? "Admin"}
        submitting={submittingId != null}
        error={passcodeError}
        onConfirm={(passcode) => {
          if (!adminPasscodeTarget) return;
          void completeSwitch(adminPasscodeTarget, passcode);
        }}
        onCancel={() => {
          setAdminPasscodeTarget(null);
          setPasscodeError(false);
        }}
      />
    </>
  );
}
