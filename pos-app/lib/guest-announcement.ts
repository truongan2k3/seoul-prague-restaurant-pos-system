import {
  GUEST_RESERVATION_LANGS,
  pickLocalizedText,
  type GuestReservationLang,
  type LocalizedGuestText,
} from "@/lib/reservation-guest-form";

export type GuestAnnouncementSurface = "landing" | "reservation";

export interface GuestAnnouncementBanner {
  enabled: boolean;
  title: LocalizedGuestText;
  message: LocalizedGuestText;
  /** ISO datetime — show from this moment (empty = already started) */
  startAt: string;
  /** ISO datetime — hide after this moment (empty = no auto expiry) */
  endAt: string;
  showOnLanding: boolean;
  showOnReservation: boolean;
}

export const GUEST_ANNOUNCEMENT_CSS_VAR = "--guest-announcement-h";
export const GUEST_ANNOUNCEMENT_DISMISS_PREFIX = "guest-announcement-dismissed:";

function emptyLocalizedText(): LocalizedGuestText {
  return { en: "", cs: "", vi: "", de: "", ko: "" };
}

function parseLocalizedText(value: unknown): LocalizedGuestText {
  const next = emptyLocalizedText();
  if (!value || typeof value !== "object") return next;
  const row = value as Record<string, unknown>;
  for (const lang of GUEST_RESERVATION_LANGS) {
    const text = row[lang];
    if (typeof text === "string") next[lang] = text;
  }
  return next;
}

export const DEFAULT_GUEST_ANNOUNCEMENT_BANNER: GuestAnnouncementBanner = {
  enabled: false,
  title: emptyLocalizedText(),
  message: emptyLocalizedText(),
  startAt: "",
  endAt: "",
  showOnLanding: true,
  showOnReservation: true,
};

export function parseGuestAnnouncementBanner(raw: unknown): GuestAnnouncementBanner {
  if (!raw || typeof raw !== "object") {
    return {
      ...DEFAULT_GUEST_ANNOUNCEMENT_BANNER,
      title: { ...DEFAULT_GUEST_ANNOUNCEMENT_BANNER.title },
      message: { ...DEFAULT_GUEST_ANNOUNCEMENT_BANNER.message },
    };
  }
  const row = raw as Record<string, unknown>;
  return {
    enabled: Boolean(row.enabled),
    title: parseLocalizedText(row.title),
    message: parseLocalizedText(row.message),
    startAt: typeof row.startAt === "string" ? row.startAt : typeof row.start_at === "string" ? row.start_at : "",
    endAt: typeof row.endAt === "string" ? row.endAt : typeof row.end_at === "string" ? row.end_at : "",
    showOnLanding:
      typeof row.showOnLanding === "boolean"
        ? row.showOnLanding
        : typeof row.show_on_landing === "boolean"
          ? row.show_on_landing
          : true,
    showOnReservation:
      typeof row.showOnReservation === "boolean"
        ? row.showOnReservation
        : typeof row.show_on_reservation === "boolean"
          ? row.show_on_reservation
          : true,
  };
}

export function guestAnnouncementBannerToDb(config: GuestAnnouncementBanner) {
  return {
    enabled: config.enabled,
    title: { ...config.title },
    message: { ...config.message },
    startAt: config.startAt,
    endAt: config.endAt,
    showOnLanding: config.showOnLanding,
    showOnReservation: config.showOnReservation,
  };
}

export function announcementHasContent(config: GuestAnnouncementBanner): boolean {
  for (const lang of GUEST_RESERVATION_LANGS) {
    if (config.title[lang]?.trim() || config.message[lang]?.trim()) return true;
  }
  return false;
}

export function isGuestAnnouncementInWindow(
  config: GuestAnnouncementBanner,
  now = Date.now(),
): boolean {
  const startAt = config.startAt.trim();
  if (startAt) {
    const startMs = new Date(startAt).getTime();
    if (!Number.isFinite(startMs) || now < startMs) return false;
  }

  const endAt = config.endAt.trim();
  if (endAt) {
    const endMs = new Date(endAt).getTime();
    if (!Number.isFinite(endMs) || now >= endMs) return false;
  }

  return true;
}

export function isGuestAnnouncementActiveOn(
  config: GuestAnnouncementBanner,
  surface: GuestAnnouncementSurface,
  now = Date.now(),
): boolean {
  if (!config.enabled) return false;
  if (!announcementHasContent(config)) return false;
  if (surface === "landing" && !config.showOnLanding) return false;
  if (surface === "reservation" && !config.showOnReservation) return false;
  return isGuestAnnouncementInWindow(config, now);
}

export function resolveGuestAnnouncementCopy(
  config: GuestAnnouncementBanner,
  lang: GuestReservationLang,
): { title: string; message: string } {
  return {
    title: pickLocalizedText(config.title, lang),
    message: pickLocalizedText(config.message, lang),
  };
}

/** Stable dismiss key so a new campaign can show again after edit. */
export function guestAnnouncementDismissKey(config: GuestAnnouncementBanner): string {
  const fingerprint = [
    config.startAt.trim(),
    config.endAt.trim(),
    config.title.en.trim(),
    config.message.en.trim(),
  ].join("|");
  return `${GUEST_ANNOUNCEMENT_DISMISS_PREFIX}${fingerprint}`;
}

export function msUntilAnnouncementEnds(config: GuestAnnouncementBanner, now = Date.now()): number | null {
  const endAt = config.endAt.trim();
  if (!endAt) return null;
  const endMs = new Date(endAt).getTime();
  if (!Number.isFinite(endMs) || endMs <= now) return 0;
  return endMs - now;
}

export function msUntilAnnouncementStarts(config: GuestAnnouncementBanner, now = Date.now()): number | null {
  const startAt = config.startAt.trim();
  if (!startAt) return null;
  const startMs = new Date(startAt).getTime();
  if (!Number.isFinite(startMs) || startMs <= now) return 0;
  return startMs - now;
}

export { toDatetimeLocalValue, fromDatetimeLocalValue } from "@/lib/marquee-settings";
