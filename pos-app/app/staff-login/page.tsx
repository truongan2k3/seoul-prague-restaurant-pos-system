"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LanguageSelector } from "@/components/language-selector";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import {
  ensureDefaultStaffCredentials,
  getStaffSessionAction,
  staffLoginAction,
} from "@/src/lib/staff-auth-actions";

const STAFF_ERROR_KEYS = {
  invalidCredentials: "staffLoginInvalid",
  passwordNotSet: "staffLoginPasswordNotSet",
  businessSessionRequired: "staffLoginBusinessRequired",
} as const;

function StaffLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const { session, loading: authLoading, logout } = useAuth();
  const { translate } = useApp();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingStaff, setCheckingStaff] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!session) {
      router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
      return;
    }

    let cancelled = false;
    void (async () => {
      await ensureDefaultStaffCredentials();
      const existing = await getStaffSessionAction();
      if (cancelled) return;
      if (existing) {
        router.replace(nextPath);
        return;
      }
      setCheckingStaff(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, session, router, nextPath]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorKey(null);

    const result = await staffLoginAction(username, password);
    setSubmitting(false);

    if (result.ok) {
      router.replace(nextPath);
      router.refresh();
      return;
    }

    const key =
      result.error && result.error in STAFF_ERROR_KEYS
        ? STAFF_ERROR_KEYS[result.error as keyof typeof STAFF_ERROR_KEYS]
        : "staffLoginInvalid";
    setErrorKey(key);
  };

  if (authLoading || checkingStaff || !session) {
    return <p className="text-sm text-gray-500">{translate("loading")}</p>;
  }

  return (
    <>
      <div className="mb-6 text-center">
        {session.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.logoUrl}
            alt=""
            className="mx-auto mb-3 h-14 w-14 rounded-xl object-cover"
          />
        ) : null}
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
          {translate("staffLoginBusinessLabel")}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-zinc-100">{session.businessName}</h1>
      </div>

      <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">{translate("staffLoginTitle")}</h2>
      <p className="mt-2 text-sm text-gray-500 dark:text-zinc-400">{translate("staffLoginHint")}</p>

      <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-4">
        <label className="block text-sm">
          <span className="font-medium text-gray-700 dark:text-zinc-300">{translate("staffUsername")}</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            className="pos-input mt-1"
            required
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-gray-700 dark:text-zinc-300">{translate("staffPassword")}</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            className="pos-input mt-1"
            required
          />
        </label>

        {errorKey && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {translate(errorKey as "staffLoginInvalid")}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="min-h-[48px] w-full rounded-xl bg-emerald-600 text-base font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
        >
          {submitting ? translate("authSigningIn") : translate("staffLoginButton")}
        </button>
      </form>

      <button
        type="button"
        onClick={() => void logout()}
        className="mt-6 w-full text-center text-sm text-gray-500 hover:text-gray-800 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        {translate("staffLoginSwitchBusiness")}
      </button>
    </>
  );
}

export default function StaffLoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-zinc-950">
      <div className="absolute right-4 top-4 z-10">
        <LanguageSelector variant="flag-menu" />
      </div>
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
        <Suspense fallback={<p className="text-sm text-gray-500">Loading…</p>}>
          <StaffLoginForm />
        </Suspense>
      </div>
    </div>
  );
}
