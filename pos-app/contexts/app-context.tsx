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
import { t, type TranslationKey } from "@/lib/i18n/translations";
import { DEFAULT_EUR_RATE, DEFAULT_USD_RATE } from "@/lib/currency";
import { canManageStaff, roleRequiresPin } from "@/lib/staff-roles";
import type { LanguageCode, StaffMember, ThemeMode } from "@/lib/types";
import { fetchStaff, mapStaffResponse } from "@/src/lib/supabase-data";

const THEME_STORAGE_KEY = "pos-theme";
const LANGUAGE_STORAGE_KEY = "pos-language";
const RECEIPT_EUR_KEY = "pos-receipt-show-eur";
const RECEIPT_USD_KEY = "pos-receipt-show-usd";
const EUR_RATE_KEY = "pos-eur-rate";
const USD_RATE_KEY = "pos-usd-rate";
const SOUND_MAIN_KEY = "pos-sound-main";
const SOUND_KITCHEN_KEY = "pos-sound-kitchen";

/** Mock session user until login flow is built — Master Liu (manager). */
const MOCK_LOGGED_IN_STAFF_ID = "30000000-0000-4000-a000-000000000006";

function readStoredBoolean(key: string, fallback = false): boolean {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) === "true";
}

function readStoredNumber(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "dark" ? "dark" : "light";
}

function readStoredLanguage(): LanguageCode {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === "en" || stored === "cs" || stored === "zh") return stored;
  return "en";
}

interface AppContextValue {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  /** @deprecated Use currentStaffUser — kept for existing components */
  staff: StaffMember | null;
  setStaff: (staff: StaffMember | null) => void;
  /** Logged-in staff member for role-based access control */
  currentStaffUser: StaffMember | null;
  staffList: StaffMember[];
  refreshStaffList: () => Promise<void>;
  canManageStaff: boolean;
  translate: (key: TranslationKey) => string;
  verifyManagerPin: (pin: string) => boolean;
  logAction: (action: string, details?: string) => void;
  receiptShowEur: boolean;
  receiptShowUsd: boolean;
  eurRate: number;
  usdRate: number;
  setReceiptShowEur: (value: boolean) => void;
  setReceiptShowUsd: (value: boolean) => void;
  setEurRate: (value: number) => void;
  setUsdRate: (value: number) => void;
  soundMainEnabled: boolean;
  soundKitchenEnabled: boolean;
  setSoundMainEnabled: (value: boolean) => void;
  setSoundKitchenEnabled: (value: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const fallbackStaff: StaffMember[] = [
  { id: "30000000-0000-4000-a000-000000000001", name: "Andy", role: "admin", active: true },
  { id: "30000000-0000-4000-a000-000000000002", name: "Lily", role: "server", active: true },
  { id: "30000000-0000-4000-a000-000000000003", name: "Adele", role: "server", active: true },
  { id: "30000000-0000-4000-a000-000000000004", name: "UK", role: "server", active: true },
  { id: "30000000-0000-4000-a000-000000000005", name: "Jennie", role: "server", active: true },
  {
    id: "30000000-0000-4000-a000-000000000006",
    name: "Master Liu",
    role: "manager",
    pin: "1234",
    active: true,
  },
];

function resolveMockSessionUser(list: StaffMember[]): StaffMember | null {
  return list.find((member) => member.id === MOCK_LOGGED_IN_STAFF_ID) ?? list[0] ?? null;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>("en");
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [staffList, setStaffList] = useState<StaffMember[]>(fallbackStaff);
  const [currentStaffUser, setCurrentStaffUser] = useState<StaffMember | null>(
    resolveMockSessionUser(fallbackStaff),
  );
  const [receiptShowEur, setReceiptShowEurState] = useState(false);
  const [receiptShowUsd, setReceiptShowUsdState] = useState(false);
  const [eurRate, setEurRateState] = useState(DEFAULT_EUR_RATE);
  const [usdRate, setUsdRateState] = useState(DEFAULT_USD_RATE);
  const [soundMainEnabled, setSoundMainEnabledState] = useState(true);
  const [soundKitchenEnabled, setSoundKitchenEnabledState] = useState(true);

  const refreshStaffList = useCallback(async () => {
    const { data, error } = await fetchStaff();
    if (error) {
      console.warn("[Staff] Failed to load from Supabase, using fallback list.", error.message);
      return;
    }
    const mapped = mapStaffResponse(data);
    setStaffList(mapped);
    setCurrentStaffUser((prev) => {
      const sessionId = prev?.id ?? MOCK_LOGGED_IN_STAFF_ID;
      return mapped.find((member) => member.id === sessionId) ?? resolveMockSessionUser(mapped);
    });
  }, []);

  useEffect(() => {
    setLanguageState(readStoredLanguage());
    setTheme(readStoredTheme());
    setReceiptShowEurState(readStoredBoolean(RECEIPT_EUR_KEY));
    setReceiptShowUsdState(readStoredBoolean(RECEIPT_USD_KEY));
    setEurRateState(readStoredNumber(EUR_RATE_KEY, DEFAULT_EUR_RATE));
    setUsdRateState(readStoredNumber(USD_RATE_KEY, DEFAULT_USD_RATE));
    setSoundMainEnabledState(readStoredBoolean(SOUND_MAIN_KEY, true));
    setSoundKitchenEnabledState(readStoredBoolean(SOUND_KITCHEN_KEY, true));
    void refreshStaffList();
  }, [refreshStaffList]);

  const setReceiptShowEur = useCallback((value: boolean) => {
    setReceiptShowEurState(value);
    localStorage.setItem(RECEIPT_EUR_KEY, String(value));
  }, []);

  const setReceiptShowUsd = useCallback((value: boolean) => {
    setReceiptShowUsdState(value);
    localStorage.setItem(RECEIPT_USD_KEY, String(value));
  }, []);

  const setEurRate = useCallback((value: number) => {
    const next = value > 0 ? value : DEFAULT_EUR_RATE;
    setEurRateState(next);
    localStorage.setItem(EUR_RATE_KEY, String(next));
  }, []);

  const setUsdRate = useCallback((value: number) => {
    const next = value > 0 ? value : DEFAULT_USD_RATE;
    setUsdRateState(next);
    localStorage.setItem(USD_RATE_KEY, String(next));
  }, []);

  const setSoundMainEnabled = useCallback((value: boolean) => {
    setSoundMainEnabledState(value);
    localStorage.setItem(SOUND_MAIN_KEY, String(value));
  }, []);

  const setSoundKitchenEnabled = useCallback((value: boolean) => {
    setSoundKitchenEnabledState(value);
    localStorage.setItem(SOUND_KITCHEN_KEY, String(value));
  }, []);

  const setLanguage = useCallback((lang: LanguageCode) => {
    setLanguageState(lang);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  }, []);

  const applyThemeToDocument = useCallback((mode: ThemeMode) => {
    const root = document.documentElement;
    if (mode === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, []);

  const setThemeMode = useCallback(
    (next: ThemeMode) => {
      setTheme(next);
      localStorage.setItem(THEME_STORAGE_KEY, next);
      applyThemeToDocument(next);
    },
    [applyThemeToDocument],
  );

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme, applyThemeToDocument]);

  const translate = useCallback((key: TranslationKey) => t(language, key), [language]);

  const setStaff = useCallback((member: StaffMember | null) => {
    setCurrentStaffUser(member);
  }, []);

  const verifyManagerPin = useCallback(
    (pin: string) =>
      staffList.some(
        (member) =>
          roleRequiresPin(member.role) && member.active && member.pin === pin,
      ),
    [staffList],
  );

  const logAction = useCallback(
    (action: string, details?: string) => {
      if (!currentStaffUser) return;
      console.info(`[ActionLog] ${currentStaffUser.name}: ${action}`, details ?? "");
    },
    [currentStaffUser],
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      theme,
      setTheme: setThemeMode,
      staff: currentStaffUser,
      setStaff,
      currentStaffUser,
      staffList,
      refreshStaffList,
      canManageStaff: canManageStaff(currentStaffUser?.role),
      translate,
      verifyManagerPin,
      logAction,
      receiptShowEur,
      receiptShowUsd,
      eurRate,
      usdRate,
      setReceiptShowEur,
      setReceiptShowUsd,
      setEurRate,
      setUsdRate,
      soundMainEnabled,
      soundKitchenEnabled,
      setSoundMainEnabled,
      setSoundKitchenEnabled,
    }),
    [
      language,
      theme,
      currentStaffUser,
      staffList,
      refreshStaffList,
      translate,
      verifyManagerPin,
      logAction,
      receiptShowEur,
      receiptShowUsd,
      eurRate,
      usdRate,
      setReceiptShowEur,
      setReceiptShowUsd,
      setEurRate,
      setUsdRate,
      setLanguage,
      setThemeMode,
      setStaff,
      soundMainEnabled,
      soundKitchenEnabled,
      setSoundMainEnabled,
      setSoundKitchenEnabled,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
