"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  getAuthSessionAction,
  loginAction,
  logoutAction,
  registerBusinessAction,
  type AuthBusiness,
} from "@/src/lib/business-auth-actions";
import type { AuthSessionPayload } from "@/src/lib/auth/session";

interface AuthContextValue {
  session: AuthSessionPayload | null;
  business: AuthBusiness | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (input: {
    businessName: string;
    username: string;
    password: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  updateBranding: (partial: { businessName?: string; logoUrl?: string }) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<AuthSessionPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    const next = await getAuthSessionAction();
    setSession(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const login = useCallback(
    async (username: string, password: string) => {
      const result = await loginAction(username, password);
      if (result.ok) {
        setSession(result.session);
        return { ok: true };
      }
      return { ok: false, error: result.error };
    },
    [],
  );

  const register = useCallback(
    async (input: { businessName: string; username: string; password: string }) => {
      const result = await registerBusinessAction(input);
      if (result.ok) {
        setSession(result.session);
        return { ok: true };
      }
      return { ok: false, error: result.error };
    },
    [],
  );

  const logout = useCallback(async () => {
    await logoutAction();
    setSession(null);
    router.push("/login");
    router.refresh();
  }, [router]);

  const updateBranding = useCallback((partial: { businessName?: string; logoUrl?: string }) => {
    setSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        businessName: partial.businessName ?? prev.businessName,
        logoUrl: partial.logoUrl ?? prev.logoUrl,
      };
    });
  }, []);

  const business = useMemo<AuthBusiness | null>(() => {
    if (!session) return null;
    return {
      id: session.businessId,
      name: session.businessName,
      slug: "",
      logoUrl: session.logoUrl,
    };
  }, [session]);

  const value = useMemo(
    () => ({
      session,
      business,
      loading,
      login,
      register,
      logout,
      refreshSession,
      updateBranding,
    }),
    [session, business, loading, login, register, logout, refreshSession, updateBranding],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
