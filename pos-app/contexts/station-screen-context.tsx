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
import type { LanguageCode, Station } from "@/lib/types";

const STORAGE_PREFIX = "pos-station";

function storageKey(station: Station, field: "language" | "staffName") {
  return `${STORAGE_PREFIX}-${station}-${field}`;
}

function readStoredLanguage(station: Station): LanguageCode {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem(storageKey(station, "language"));
  if (stored === "en" || stored === "cs" || stored === "zh") return stored;
  return "en";
}

function readStoredStaffName(station: Station): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(storageKey(station, "staffName")) ?? "";
}

interface StationScreenContextValue {
  station: Station;
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  staffName: string;
  setStaffName: (name: string) => void;
  translate: (key: TranslationKey) => string;
}

const StationScreenContext = createContext<StationScreenContextValue | null>(null);

export function StationScreenProvider({
  station,
  children,
}: {
  station: Station;
  children: ReactNode;
}) {
  const [language, setLanguageState] = useState<LanguageCode>("en");
  const [staffName, setStaffNameState] = useState("");

  useEffect(() => {
    setLanguageState(readStoredLanguage(station));
    setStaffNameState(readStoredStaffName(station));
  }, [station]);

  const setLanguage = useCallback(
    (lang: LanguageCode) => {
      setLanguageState(lang);
      localStorage.setItem(storageKey(station, "language"), lang);
    },
    [station],
  );

  const setStaffName = useCallback(
    (name: string) => {
      setStaffNameState(name);
      localStorage.setItem(storageKey(station, "staffName"), name);
    },
    [station],
  );

  const translate = useCallback((key: TranslationKey) => t(language, key), [language]);

  const value = useMemo(
    () => ({
      station,
      language,
      setLanguage,
      staffName,
      setStaffName,
      translate,
    }),
    [station, language, staffName, setLanguage, setStaffName, translate],
  );

  return (
    <StationScreenContext.Provider value={value}>{children}</StationScreenContext.Provider>
  );
}

export function useStationScreen() {
  const ctx = useContext(StationScreenContext);
  if (!ctx) {
    throw new Error("useStationScreen must be used within StationScreenProvider");
  }
  return ctx;
}
