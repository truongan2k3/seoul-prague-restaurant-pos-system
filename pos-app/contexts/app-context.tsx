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
import { canManageStaff } from "@/lib/staff-roles";
import type { LanguageCode, StaffMember, ThemeMode } from "@/lib/types";
import {
  getCurrentStaffMemberAction,
  listStaffAction,
  switchStaffAction,
} from "@/src/lib/staff-auth-actions";

const THEME_STORAGE_KEY = "pos-theme";
const LANGUAGE_STORAGE_KEY = "pos-language";
const RECEIPT_EUR_KEY = "pos-receipt-show-eur";
const RECEIPT_USD_KEY = "pos-receipt-show-usd";
const EUR_RATE_KEY = "pos-eur-rate";
const USD_RATE_KEY = "pos-usd-rate";
const SOUND_MAIN_KEY = "pos-sound-main";
const SOUND_KITCHEN_KEY = "pos-sound-kitchen";
const NOTIFY_MAIN_NEW_ORDER_KEY = "pos-notify-main-new-order";
const SOUND_MAIN_NEW_ORDER_KEY = "pos-sound-main-new-order";

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
  switchStaff: (member: StaffMember) => boolean;
  staffSwitchOpen: boolean;
  staffSwitchTarget: StaffMember | null;
  staffSwitchError: boolean;
  submitStaffSwitchPassword: (password: string) => Promise<void>;
  cancelStaffSwitch: () => void;
  canManageStaff: boolean;
  translate: (key: TranslationKey) => string;
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
  notifyMainNewOrderEnabled: boolean;
  soundMainNewOrderEnabled: boolean;
  setSoundMainEnabled: (value: boolean) => void;
  setSoundKitchenEnabled: (value: boolean) => void;
  setNotifyMainNewOrderEnabled: (value: boolean) => void;
  setSoundMainNewOrderEnabled: (value: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>("en");
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [currentStaffUser, setCurrentStaffUser] = useState<StaffMember | null>(null);
  const [staffSwitchOpen, setStaffSwitchOpen] = useState(false);
  const [staffSwitchTarget, setStaffSwitchTarget] = useState<StaffMember | null>(null);
  const [staffSwitchError, setStaffSwitchError] = useState(false);
  const [receiptShowEur, setReceiptShowEurState] = useState(false);
  const [receiptShowUsd, setReceiptShowUsdState] = useState(false);
  const [eurRate, setEurRateState] = useState(DEFAULT_EUR_RATE);
  const [usdRate, setUsdRateState] = useState(DEFAULT_USD_RATE);
  const [soundMainEnabled, setSoundMainEnabledState] = useState(true);
  const [soundKitchenEnabled, setSoundKitchenEnabledState] = useState(true);
  const [notifyMainNewOrderEnabled, setNotifyMainNewOrderEnabledState] = useState(true);
  const [soundMainNewOrderEnabled, setSoundMainNewOrderEnabledState] = useState(true);

  const refreshStaffList = useCallback(async () => {
    const [{ data: roster, error: rosterError }, current] = await Promise.all([
      listStaffAction(),
      getCurrentStaffMemberAction(),
    ]);

    if (rosterError) {
      console.warn("[Staff] Failed to load roster.", rosterError);
    } else {
      setStaffList(roster);
    }

    setCurrentStaffUser(current);
  }, []);

  const applyStaffSession = useCallback((member: StaffMember) => {
    setCurrentStaffUser(member);
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
    setNotifyMainNewOrderEnabledState(readStoredBoolean(NOTIFY_MAIN_NEW_ORDER_KEY, true));
    setSoundMainNewOrderEnabledState(readStoredBoolean(SOUND_MAIN_NEW_ORDER_KEY, true));
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

  const setNotifyMainNewOrderEnabled = useCallback((value: boolean) => {
    setNotifyMainNewOrderEnabledState(value);
    localStorage.setItem(NOTIFY_MAIN_NEW_ORDER_KEY, String(value));
  }, []);

  const setSoundMainNewOrderEnabled = useCallback((value: boolean) => {
    setSoundMainNewOrderEnabledState(value);
    localStorage.setItem(SOUND_MAIN_NEW_ORDER_KEY, String(value));
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

  const setStaff = useCallback(
    (member: StaffMember | null) => {
      setCurrentStaffUser(member);
    },
    [],
  );

  const cancelStaffSwitch = useCallback(() => {
    setStaffSwitchOpen(false);
    setStaffSwitchTarget(null);
    setStaffSwitchError(false);
  }, []);

  const switchStaff = useCallback(
    (member: StaffMember): boolean => {
      if (!member.active) return false;
      if (member.id === currentStaffUser?.id) return true;

      setStaffSwitchTarget(member);
      setStaffSwitchError(false);
      setStaffSwitchOpen(true);
      return true;
    },
    [currentStaffUser?.id],
  );

  const submitStaffSwitchPassword = useCallback(
    async (password: string) => {
      if (!staffSwitchTarget) return;
      const result = await switchStaffAction(staffSwitchTarget.id, password);
      if (!result.ok) {
        setStaffSwitchError(true);
        return;
      }
      if (result.member) {
        applyStaffSession(result.member);
      }
      cancelStaffSwitch();
    },
    [applyStaffSession, cancelStaffSwitch, staffSwitchTarget],
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
      switchStaff,
      staffSwitchOpen,
      staffSwitchTarget,
      staffSwitchError,
      submitStaffSwitchPassword,
      cancelStaffSwitch,
      canManageStaff: canManageStaff(currentStaffUser?.role),
      translate,
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
      notifyMainNewOrderEnabled,
      soundMainNewOrderEnabled,
      setSoundMainEnabled,
      setSoundKitchenEnabled,
      setNotifyMainNewOrderEnabled,
      setSoundMainNewOrderEnabled,
    }),
    [
      language,
      theme,
      currentStaffUser,
      staffList,
      refreshStaffList,
      translate,
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
      switchStaff,
      staffSwitchOpen,
      staffSwitchTarget,
      staffSwitchError,
      submitStaffSwitchPassword,
      cancelStaffSwitch,
      soundMainEnabled,
      soundKitchenEnabled,
      notifyMainNewOrderEnabled,
      soundMainNewOrderEnabled,
      setSoundMainEnabled,
      setSoundKitchenEnabled,
      setNotifyMainNewOrderEnabled,
      setSoundMainNewOrderEnabled,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
