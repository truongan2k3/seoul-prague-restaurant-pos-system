"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LanguageSelector } from "@/components/language-selector";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import type { StaffMember } from "@/lib/types";
import {
  ensureStaffRosterCleanup,
  getStaffSessionAction,
  listStaffAction,
  selectStaffAction,
} from "@/src/lib/staff-auth-actions";

function StaffLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const { session, loading: authLoading, logout } = useAuth();
  const { translate } = useApp();

  const [roster, setRoster] = useState<StaffMember[]>([]);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [checkingStaff, setCheckingStaff] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!session) {
      router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
      return;
    }

    let cancelled = false;
    void (async () => {
      await ensureStaffRosterCleanup();
      const existing = await getStaffSessionAction();
      if (cancelled) return;
      if (existing) {
        router.replace(nextPath);
        return;
      }
      const { data } = await listStaffAction();
      if (cancelled) return;
      setRoster((data ?? []).filter((member) => member.active));
      setCheckingStaff(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, session, router, nextPath]);

  const handleSelect = async (member: StaffMember) => {
    setSubmittingId(member.id);
    setError(null);
    const result = await selectStaffAction(member.id);
    setSubmittingId(null);

    if (result.ok) {
      router.replace(nextPath);
      router.refresh();
      return;
    }
    setError(translate("staffLoginInvalid"));
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

      <div className="mt-6 space-y-2">
        {roster.length === 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {translate("staffLoginEmptyRoster")}
          </p>
        ) : (
          roster.map((member) => (
            <button
              key={member.id}
              type="button"
              disabled={submittingId != null}
              onClick={() => void handleSelect(member)}
              className="flex min-h-[52px] w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/30"
            >
              <span className="text-base font-semibold text-gray-900 dark:text-zinc-100">
                {member.name}
              </span>
              <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                {submittingId === member.id ? translate("authSigningIn") : member.role}
              </span>
            </button>
          ))
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

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
