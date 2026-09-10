import type { WebsiteReservationBackground } from "@/lib/website/types";

export const DEFAULT_RESERVATION_BACKGROUND: WebsiteReservationBackground = {
  enabled: false,
  videoUrl: "",
  videoUrlMobile: "",
  posterUrl: "",
  overlayOpacity: 58,
  objectPosition: "50% 50%",
  objectPositionMobile: "50% 40%",
};

export const RESERVATION_BG_UPLOAD_TIPS = {
  desktop:
    "Prefer short looping WebM or MP4 (≤12s, ≤12MB). Avoid GIF — they are much heavier.",
  mobile:
    "Optional lighter mobile clip (≤8s, ≤6MB). If empty, desktop video or poster is used.",
  poster:
    "Still frame or smoke still (WebP/JPG). Shown while loading, on weak devices, and when autoplay is blocked.",
};

export function normalizeReservationBackground(
  value: unknown,
): WebsiteReservationBackground {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_RESERVATION_BACKGROUND };
  }
  const entry = value as Record<string, unknown>;
  const opacity =
    typeof entry.overlayOpacity === "number"
      ? entry.overlayOpacity
      : typeof entry.overlay_opacity === "number"
        ? entry.overlay_opacity
        : DEFAULT_RESERVATION_BACKGROUND.overlayOpacity;
  return {
    enabled: entry.enabled === true,
    videoUrl:
      typeof entry.videoUrl === "string"
        ? entry.videoUrl
        : typeof entry.video_url === "string"
          ? entry.video_url
          : "",
    videoUrlMobile:
      typeof entry.videoUrlMobile === "string"
        ? entry.videoUrlMobile
        : typeof entry.video_url_mobile === "string"
          ? entry.video_url_mobile
          : "",
    posterUrl:
      typeof entry.posterUrl === "string"
        ? entry.posterUrl
        : typeof entry.poster_url === "string"
          ? entry.poster_url
          : "",
    overlayOpacity: Math.min(90, Math.max(0, Math.round(opacity))),
    objectPosition:
      typeof entry.objectPosition === "string" && entry.objectPosition.trim()
        ? entry.objectPosition
        : DEFAULT_RESERVATION_BACKGROUND.objectPosition,
    objectPositionMobile:
      typeof entry.objectPositionMobile === "string" &&
      entry.objectPositionMobile.trim()
        ? entry.objectPositionMobile
        : DEFAULT_RESERVATION_BACKGROUND.objectPositionMobile,
  };
}

export function reservationBackgroundHasMedia(
  bg: WebsiteReservationBackground,
): boolean {
  return Boolean(bg.posterUrl || bg.videoUrl || bg.videoUrlMobile);
}

/** Infer whether a URL should render as <video> vs <img>. */
export function isReservationVideoUrl(url: string): boolean {
  if (!url) return false;
  const clean = url.split("?")[0]?.toLowerCase() ?? "";
  return (
    clean.endsWith(".mp4") ||
    clean.endsWith(".webm") ||
    clean.endsWith(".mov") ||
    clean.endsWith(".m4v")
  );
}

export function isReservationGifUrl(url: string): boolean {
  if (!url) return false;
  const clean = url.split("?")[0]?.toLowerCase() ?? "";
  return clean.endsWith(".gif");
}
