"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "pos-halloween-animations";
const CHANGE_EVENT = "pos:seasonal-animations";
let fallbackEnabled = true;

function readEnabled() {
  try { return localStorage.getItem(STORAGE_KEY) !== "off"; }
  catch { return fallbackEnabled; }
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function setEnabled(enabled: boolean) {
  fallbackEnabled = enabled;
  try { localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off"); } catch { /* Session fallback. */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function usePosSeasonalEffects() {
  return [useSyncExternalStore(subscribe, readEnabled, () => true), setEnabled] as const;
}
