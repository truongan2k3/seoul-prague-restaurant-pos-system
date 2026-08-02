"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { useApp } from "@/contexts/app-context";
import { usePinGate } from "@/contexts/pin-gate-context";

export function ManagerPinModal() {
  const { translate } = useApp();
  const { pinOpen, pinError, submitPin, cancelPin } = usePinGate();
  const [pin, setPin] = useState("");

  if (!pinOpen) return null;

  const handleSubmit = () => {
    submitPin(pin);
    if (pinError === null) setPin("");
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={cancelPin} className="absolute inset-0 bg-black/50" />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {translate("managerPin")}
          </h2>
          <button type="button" onClick={cancelPin} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="pos-input mt-4 text-center text-2xl tracking-[0.5em]"
          placeholder="••••"
        />
        {pinError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{pinError}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={cancelPin} className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-800 dark:border-gray-600 dark:text-gray-200">
            {translate("cancel")}
          </button>
          <button type="button" onClick={handleSubmit} className="flex-1 rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white dark:bg-gray-100 dark:text-gray-900">
            {translate("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
