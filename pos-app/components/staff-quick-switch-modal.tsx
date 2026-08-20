"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { ModalOverlay, ModalPanel } from "@/components/modal-overlay";
import { useApp } from "@/contexts/app-context";
import { switchStaffAction } from "@/src/lib/staff-auth-actions";
import type { StaffMember } from "@/lib/types";

interface StaffQuickSwitchModalProps {
  open: boolean;
  onClose: () => void;
}

export function StaffQuickSwitchModal({ open, onClose }: StaffQuickSwitchModalProps) {
  const { translate, staffList, currentStaffUser, refreshStaffList, setStaff } = useApp();
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const activeStaff = staffList.filter((member) => member.active);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setPassword("");
      setError(false);
      setSubmitting(false);
      return;
    }
    setSelected(currentStaffUser);
  }, [open, currentStaffUser]);

  const handleSubmit = async () => {
    if (!selected || !password.trim() || submitting) return;
    if (selected.id === currentStaffUser?.id) {
      onClose();
      return;
    }
    setSubmitting(true);
    setError(false);
    const result = await switchStaffAction(selected.id, password);
    setSubmitting(false);
    if (!result.ok) {
      setError(true);
      return;
    }
    if (result.member) {
      setStaff(result.member);
    }
    await refreshStaffList();
    onClose();
  };

  return (
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

          <div className="mt-4 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-1 dark:border-gray-600">
            {activeStaff.map((member) => {
              const isCurrent = member.id === currentStaffUser?.id;
              const isSelected = member.id === selected?.id;
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => {
                    setSelected(member);
                    setError(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${
                    isSelected
                      ? "bg-emerald-600 text-white"
                      : "text-gray-800 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  <span className="font-medium">{member.name}</span>
                  <span className={`text-xs uppercase ${isSelected ? "text-emerald-100" : "text-gray-500"}`}>
                    {member.username ? `@${member.username}` : member.role}
                    {isCurrent ? ` · ${translate("staffQuickSwitchCurrent")}` : ""}
                  </span>
                </button>
              );
            })}
          </div>

          {selected && selected.id !== currentStaffUser?.id && (
            <>
              <label className="mt-4 block">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {translate("staffPassword")}
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError(false);
                  }}
                  className="pos-input mt-1"
                  autoComplete="current-password"
                  placeholder="••••••"
                />
              </label>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {translate("staffSwitchPasswordHint").replace("{name}", selected.name)}
              </p>
            </>
          )}

          {error && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {translate("staffSwitchPasswordInvalid")}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-800 dark:border-gray-600 dark:text-gray-200"
            >
              {translate("cancel")}
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={
                submitting ||
                !selected ||
                (selected.id !== currentStaffUser?.id && !password.trim())
              }
              className="flex-1 rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-gray-100 dark:text-gray-900"
            >
              {submitting ? translate("authSigningIn") : translate("staffQuickSwitchConfirm")}
            </button>
          </div>
        </div>
      </ModalPanel>
    </ModalOverlay>
  );
}
