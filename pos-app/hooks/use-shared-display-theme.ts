"use client";

import { useCallback } from "react";
import { useApp } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import type { ThemeMode } from "@/lib/types";

/** Use the existing settings record and realtime subscription for all venue screens. */
export function useSharedDisplayTheme() {
  const { theme, setTheme } = useApp();
  const { settings, saveSettings, saving, loading } = useSettings();
  const selectTheme = useCallback(async (next: ThemeMode) => {
    const previous = theme;
    setTheme(next);
    const saved = await saveSettings({ serverScreen: { ...settings.serverScreen, sharedTheme: next } });
    if (!saved) setTheme(previous);
    return saved;
  }, [theme, setTheme, settings.serverScreen, saveSettings]);
  return { selectTheme, saving: saving || loading };
}
