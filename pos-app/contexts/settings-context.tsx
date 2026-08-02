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
import type { AppSettings } from "@/lib/types";
import {
  DEFAULT_APP_SETTINGS,
  fetchAppSettings,
  subscribeToSettingsChanges,
  updateAppSettings,
  uploadCustomAlertSound,
  type PrinterBillSettingsDraft,
} from "@/src/lib/settings-actions";

interface SettingsContextValue {
  settings: AppSettings;
  loading: boolean;
  saving: boolean;
  error: string | null;
  saveSettings: (partial: Partial<AppSettings>) => Promise<boolean>;
  savePrinterBillSettings: (draft: PrinterBillSettingsDraft) => Promise<boolean>;
  uploadAlertSound: (file: File) => Promise<void>;
  refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSettings = useCallback(async () => {
    const { data, error: fetchError } = await fetchAppSettings();
    if (fetchError) {
      setError(fetchError.message);
    } else {
      setSettings(data);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refreshSettings();
    return subscribeToSettingsChanges(() => void refreshSettings());
  }, [refreshSettings]);

  const saveSettings = useCallback(async (partial: Partial<AppSettings>) => {
    setSaving(true);
    const { data, error: saveError } = await updateAppSettings(partial);
    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return false;
    }
    if (data) {
      setSettings(data);
      setError(null);
    }
    return true;
  }, []);

  const savePrinterBillSettings = useCallback(
    async (draft: PrinterBillSettingsDraft) => saveSettings(draft),
    [saveSettings],
  );

  const uploadAlertSound = useCallback(async (file: File) => {
    setSaving(true);
    const { data, error: uploadError } = await uploadCustomAlertSound(file);
    setSaving(false);

    if (uploadError) {
      setError(uploadError.message);
      return;
    }
    if (data) {
      setSettings(data);
      setError(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      settings,
      loading,
      saving,
      error,
      saveSettings,
      savePrinterBillSettings,
      uploadAlertSound,
      refreshSettings,
    }),
    [settings, loading, saving, error, saveSettings, savePrinterBillSettings, uploadAlertSound, refreshSettings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
