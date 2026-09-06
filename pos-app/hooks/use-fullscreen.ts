"use client";

import { useCallback, useEffect, useState } from "react";

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function getFullscreenElement(): Element | null {
  if (typeof document === "undefined") return null;
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function canRequestFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.documentElement as FullscreenElement;
  return typeof el.requestFullscreen === "function" || typeof el.webkitRequestFullscreen === "function";
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(canRequestFullscreen());
    setIsFullscreen(Boolean(getFullscreenElement()));

    const onChange = () => setIsFullscreen(Boolean(getFullscreenElement()));
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  const enter = useCallback(async () => {
    const el = document.documentElement as FullscreenElement;
    try {
      if (typeof el.requestFullscreen === "function") {
        await el.requestFullscreen();
      } else if (typeof el.webkitRequestFullscreen === "function") {
        await el.webkitRequestFullscreen();
      }
    } catch {
      // User gesture / browser policy may reject; keep UI usable.
    }
  }, []);

  const exit = useCallback(async () => {
    const doc = document as FullscreenDocument;
    try {
      if (typeof doc.exitFullscreen === "function") {
        await doc.exitFullscreen();
      } else if (typeof doc.webkitExitFullscreen === "function") {
        await doc.webkitExitFullscreen();
      }
    } catch {
      // ignore
    }
  }, []);

  const toggle = useCallback(async () => {
    if (getFullscreenElement()) await exit();
    else await enter();
  }, [enter, exit]);

  return { isFullscreen, supported, toggle, enter, exit };
}
