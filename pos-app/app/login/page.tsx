"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useApp } from "@/contexts/app-context";

const AUTH_ERROR_KEYS = {
  invalidCredentials: "authErrorInvalidCredentials",
  databaseNotReady: "authErrorDatabaseNotReady",
} as const;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const { login, session, loading } = useAuth();
  const { translate } = useApp();

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && session) {
      router.replace(nextPath);
    }
  }, [loading, session, router, nextPath]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorKey(null);

    const result = await login(username, password);
    setSubmitting(false);

    if (result.ok) {
      router.replace(nextPath);
      router.refresh();
      return;
    }

    const key =
      result.error && result.error in AUTH_ERROR_KEYS
        ? AUTH_ERROR_KEYS[result.error as keyof typeof AUTH_ERROR_KEYS]
        : "authErrorInvalidCredentials";
    setErrorKey(key);
  };

  if (loading) {
    return <p className="text-sm text-gray-500">{translate("loading")}</p>;
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">{translate("authLoginTitle")}</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-zinc-400">{translate("authLoginHint")}</p>

      <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-4">
        <label className="block text-sm">
          <span className="font-medium text-gray-700 dark:text-zinc-300">{translate("authUsername")}</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            className="pos-input mt-1"
            required
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-gray-700 dark:text-zinc-300">{translate("authPassword")}</span>
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
            {translate(errorKey as "authErrorInvalidCredentials")}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="min-h-[48px] w-full rounded-xl bg-emerald-600 text-base font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
        >
          {submitting ? translate("authSigningIn") : translate("authSignIn")}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500 dark:text-zinc-400">
        {translate("authNoAccount")}{" "}
        <Link href="/register" className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
          {translate("authRegisterLink")}
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
        <Suspense fallback={<p className="text-sm text-gray-500">Loading…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
