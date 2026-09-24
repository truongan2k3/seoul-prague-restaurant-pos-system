"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Megaphone, X } from "lucide-react";
import {
  GUEST_ANNOUNCEMENT_CSS_VAR,
  guestAnnouncementDismissKey,
  isGuestAnnouncementActiveOn,
  msUntilAnnouncementEnds,
  msUntilAnnouncementStarts,
  resolveGuestAnnouncementCopy,
  type GuestAnnouncementBanner,
  type GuestAnnouncementSurface,
} from "@/lib/guest-announcement";
import {
  GUEST_LANG_CHANGE_EVENT,
  GUEST_LANG_SESSION_KEY,
  parseGuestReservationLang,
  resolveInitialGuestReservationLang,
} from "@/lib/i18n/guest-reservation";
import type { GuestReservationLang } from "@/lib/reservation-guest-form";
import { DEFAULT_APP_SETTINGS, fetchAppSettings } from "@/src/lib/settings-actions";

/** Presentational bar — used by live guest pages and admin preview. */
export function GuestAnnouncementBar({
  title,
  message,
  onDismiss,
  preview = false,
}: {
  title: string;
  message: string;
  onDismiss?: () => void;
  preview?: boolean;
}) {
  if (!title && !message) return null;

  return (
    <div
      role={preview ? "presentation" : "status"}
      aria-live={preview ? undefined : "polite"}
      className={`guest-announcement-enter border-b border-white/10 bg-[#121214] text-[#E8D5C4] ${
        preview ? "relative" : "fixed inset-x-0 top-0 z-[60]"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-2.5 sm:items-center sm:px-5 lg:px-8">
        <Megaphone
          className="mt-0.5 h-4 w-4 shrink-0 text-[#C9A88B] sm:mt-0"
          aria-hidden
        />
        <div className="min-w-0 flex-1 text-center sm:text-left">
          {title ? (
            <p className="landing-serif text-[13px] font-medium tracking-wide text-[#E8D5C4] sm:text-sm">
              {title}
            </p>
          ) : null}
          {message ? (
            <p
              className={`text-[12px] leading-relaxed text-white/70 sm:text-[13px] ${
                title ? "mt-0.5" : ""
              }`}
            >
              {message}
            </p>
          ) : null}
        </div>
        {onDismiss || preview ? (
          <button
            type="button"
            onClick={preview ? undefined : onDismiss}
            disabled={preview}
            aria-label="Dismiss announcement"
            className="shrink-0 rounded p-1 text-white/45 transition hover:bg-white/5 hover:text-white/80 disabled:pointer-events-none disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function setAnnouncementOffset(px: number) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(GUEST_ANNOUNCEMENT_CSS_VAR, `${Math.max(0, px)}px`);
}

function clearAnnouncementOffset() {
  if (typeof document === "undefined") return;
  document.documentElement.style.removeProperty(GUEST_ANNOUNCEMENT_CSS_VAR);
}

export function GuestAnnouncementBannerHost({
  surface,
  config: configProp,
  lang: langProp,
}: {
  surface: GuestAnnouncementSurface;
  /** When provided (e.g. server-fetched), skip client fetch. */
  config?: GuestAnnouncementBanner;
  /** Prefer the page’s active guest language when available. */
  lang?: GuestReservationLang;
}) {
  const [config, setConfig] = useState<GuestAnnouncementBanner>(
    configProp ?? DEFAULT_APP_SETTINGS.guestAnnouncementBanner,
  );
  const [lang, setLang] = useState<GuestReservationLang>(langProp ?? "en");
  const [dismissed, setDismissed] = useState(false);
  const [ready, setReady] = useState(Boolean(configProp));
  const [tick, setTick] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (configProp) {
      setConfig(configProp);
      setReady(true);
      return;
    }
    let cancelled = false;
    void fetchAppSettings().then(({ data }) => {
      if (cancelled) return;
      setConfig(data.guestAnnouncementBanner);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [configProp]);

  useEffect(() => {
    if (langProp) {
      setLang(langProp);
      return;
    }
    try {
      const stored = sessionStorage.getItem(GUEST_LANG_SESSION_KEY);
      const navigatorLangs =
        typeof navigator !== "undefined" ? [...(navigator.languages ?? []), navigator.language] : [];
      setLang(resolveInitialGuestReservationLang(stored, navigatorLangs));
    } catch {
      setLang("en");
    }

    const onLangChange = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      setLang(parseGuestReservationLang(typeof detail === "string" ? detail : null));
    };
    window.addEventListener(GUEST_LANG_CHANGE_EVENT, onLangChange);
    return () => window.removeEventListener(GUEST_LANG_CHANGE_EVENT, onLangChange);
  }, [langProp]);

  useEffect(() => {
    if (!ready) return;
    const dismissKey = guestAnnouncementDismissKey(config);
    try {
      setDismissed(sessionStorage.getItem(dismissKey) === "1");
    } catch {
      setDismissed(false);
    }
  }, [config, ready]);

  // Re-evaluate when start/end window crosses.
  useEffect(() => {
    if (!ready || !config.enabled) return;

    const timers: number[] = [];
    const startIn = msUntilAnnouncementStarts(config);
    if (startIn != null && startIn > 0) {
      timers.push(
        window.setTimeout(() => setTick((value) => value + 1), Math.min(startIn + 50, 2_147_000_000)),
      );
    }
    const endIn = msUntilAnnouncementEnds(config);
    if (endIn != null && endIn > 0) {
      timers.push(
        window.setTimeout(() => setTick((value) => value + 1), Math.min(endIn + 50, 2_147_000_000)),
      );
    }

    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [config, ready, tick]);

  const active = ready && !dismissed && isGuestAnnouncementActiveOn(config, surface);
  const copy = resolveGuestAnnouncementCopy(config, lang);

  useLayoutEffect(() => {
    if (!active) {
      clearAnnouncementOffset();
      return;
    }

    const node = barRef.current;
    if (!node) return;

    const sync = () => setAnnouncementOffset(node.getBoundingClientRect().height);
    sync();

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    observer?.observe(node);
    window.addEventListener("resize", sync);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", sync);
      clearAnnouncementOffset();
    };
  }, [active, copy.title, copy.message]);

  useEffect(() => {
    return () => clearAnnouncementOffset();
  }, []);

  if (!active || (!copy.title && !copy.message)) return null;

  const handleDismiss = () => {
    const dismissKey = guestAnnouncementDismissKey(config);
    try {
      sessionStorage.setItem(dismissKey, "1");
    } catch {
      /* ignore quota / private mode */
    }
    setDismissed(true);
    clearAnnouncementOffset();
  };

  return (
    <div ref={barRef}>
      <GuestAnnouncementBar title={copy.title} message={copy.message} onDismiss={handleDismiss} />
    </div>
  );
}
