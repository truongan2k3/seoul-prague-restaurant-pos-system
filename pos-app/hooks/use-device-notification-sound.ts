"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Station } from "@/lib/types";

const EVENT = "pos:device-sound-changed";
const fallback = new Map<string, boolean>();
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(EVENT, callback); };
}
export function useDeviceNotificationSound(station: Station) {
  const key = `pos:notification-sound:${station}`;
  const read = useCallback(() => {
    try { return localStorage.getItem(key) !== "off"; } catch { return fallback.get(key) ?? true; }
  }, [key]);
  const enabled = useSyncExternalStore(subscribe, read, () => true);
  const setEnabled = useCallback((next: boolean) => {
    fallback.set(key, next);
    try { localStorage.setItem(key, next ? "on" : "off"); } catch { /* Session fallback. */ }
    window.dispatchEvent(new Event(EVENT));
  }, [key]);
  return [enabled, setEnabled] as const;
}
