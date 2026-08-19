"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ModalOverlay, ModalPanel } from "@/components/modal-overlay";
import { OnScreenNumericKeyboard } from "@/components/on-screen-numeric-keyboard";
import { useApp } from "@/contexts/app-context";

const PIN_MAX_LENGTH = 4;

export function StaffSwitchModal() {
  const {
    translate,
    staffSwitchOpen,
    staffSwitchTarget,
    staffSwitchError,
    submitStaffSwitchPassword,
    cancelStaffSwitch,
  } = useApp();
  const [pin, setPin] = useState("");

  useEffect(() => {
    if (!staffSwitchOpen) {
      setPin("");
    }
  }, [staffSwitchOpen]);

  const open = Boolean(staffSwitchOpen && staffSwitchTarget);
  const targetRef = useRef(staffSwitchTarget);
  if (staffSwitchTarget) targetRef.current = staffSwitchTarget;
  const target = staffSwitchTarget ?? targetRef.current;

  const handleSubmit = () => {
    if (!pin.trim()) return;
    submitStaffSwitchPassword(pin);
  };

  if (!target) return null;

  return (
    <ModalOverlay
      open={open}
      onClose={cancelStaffSwitch}
      zIndexClass="z-[60]"
      className="flex items-end justify-center p-2 sm:items-center sm:p-4"
      backdropClassName="bg-black/50"
    >
      <ModalPanel className="flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
        <div className="shrink-0 p-4 pb-2 sm:p-6 sm:pb-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {translate("staffSwitchPasswordTitle")}
            </h2>
            <button
              type="button"
              onClick={cancelStaffSwitch}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            {translate("staffSwitchPasswordHint").replace("{name}", target.name)}
          </p>
          <input
            type="password"
            inputMode="numeric"
            readOnly
            maxLength={PIN_MAX_LENGTH}
            value={pin}
            aria-label={translate("staffPin")}
            className="pos-input mt-4 text-center text-2xl tracking-[0.5em]"
            placeholder="••••"
          />
          {staffSwitchError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {translate("staffSwitchPasswordInvalid")}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={cancelStaffSwitch}
              className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-800 dark:border-gray-600 dark:text-gray-200"
            >
              {translate("cancel")}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={pin.length < 4}
              className="flex-1 rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-gray-100 dark:text-gray-900"
            >
              {translate("confirm")}
            </button>
          </div>
        </div>

        <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-2 py-2 dark:border-gray-700 dark:bg-gray-900/80">
          <OnScreenNumericKeyboard
            value={pin}
            onChange={(next) => setPin(next.replace(/\D/g, "").slice(0, PIN_MAX_LENGTH))}
            onHide={cancelStaffSwitch}
            allowDecimal={false}
          />
        </div>
      </ModalPanel>
    </ModalOverlay>
  );
}
