"use client";

import { FormEvent, useState } from "react";
import { useApp } from "@/contexts/app-context";
import { changeManagerPasscodeAction } from "@/src/lib/manager-passcode-actions";

interface ManagerPasscodeChangeFormProps {
  onSuccess?: () => void;
  className?: string;
}

export function ManagerPasscodeChangeForm({ onSuccess, className = "" }: ManagerPasscodeChangeFormProps) {
  const { translate } = useApp();
  const [currentPasscode, setCurrentPasscode] = useState("");
  const [newPasscode, setNewPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);

    const result = await changeManagerPasscodeAction({
      currentPasscode,
      newPasscode,
      confirmPasscode,
    });

    setSubmitting(false);

    if (result.ok) {
      setCurrentPasscode("");
      setNewPasscode("");
      setConfirmPasscode("");
      setMessage(translate("managerPasscodeChanged"));
      onSuccess?.();
      return;
    }

    if (result.error === "invalidCurrentPasscode") {
      setError(translate("managerPasscodeInvalidCurrent"));
      return;
    }
    if (result.error === "passcodeMismatch") {
      setError(translate("managerPasscodeMismatch"));
      return;
    }
    if (result.error === "passwordTooShort") {
      setError(translate("managerPasscodeTooShort"));
      return;
    }
    setError(translate("saveFailed"));
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className={`space-y-4 ${className}`}>
      <label className="block text-sm">
        <span className="font-medium text-gray-700 dark:text-zinc-300">
          {translate("managerPasscodeCurrent")}
        </span>
        <input
          type="password"
          value={currentPasscode}
          onChange={(event) => setCurrentPasscode(event.target.value)}
          className="pos-input mt-1"
          autoComplete="current-password"
          required
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-gray-700 dark:text-zinc-300">
          {translate("managerPasscodeNew")}
        </span>
        <input
          type="password"
          value={newPasscode}
          onChange={(event) => setNewPasscode(event.target.value)}
          className="pos-input mt-1"
          autoComplete="new-password"
          required
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-gray-700 dark:text-zinc-300">
          {translate("managerPasscodeConfirm")}
        </span>
        <input
          type="password"
          value={confirmPasscode}
          onChange={(event) => setConfirmPasscode(event.target.value)}
          className="pos-input mt-1"
          autoComplete="new-password"
          required
        />
      </label>

      {message && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="min-h-[44px] w-full rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
      >
        {submitting ? translate("authSigningIn") : translate("managerPasscodeChangeButton")}
      </button>
    </form>
  );
}
