import type { WebsiteReservationBackground } from "@/lib/website/types";

export const DEFAULT_RESERVATION_BACKGROUND: WebsiteReservationBackground = {
  enabled: false,
  youtubeUrl: "",
  videoUrl: "",
  videoUrlMobile: "",
  posterUrl: "",
  overlayOpacity: 58,
  objectPosition: "50% 50%",
  objectPositionMobile: "50% 40%",
};

export const RESERVATION_BG_UPLOAD_TIPS = {
  youtube:
    "Paste a YouTube link for muted autoplay background. Best for egress — video streams from YouTube, not Supabase.",
  desktop:
    "Optional file upload if you are not using YouTube. Prefer short WebM/MP4 (≤12s, ≤12MB). Avoid large GIFs.",
  mobile:
    "Optional lighter mobile clip (≤8s, ≤6MB). Ignored when YouTube URL is set.",
  poster:
    "Still frame (WebP/JPG). Shown while YouTube/video loads, on weak devices, and when autoplay is blocked.",
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
    youtubeUrl:
      typeof entry.youtubeUrl === "string"
        ? entry.youtubeUrl.trim()
        : typeof entry.youtube_url === "string"
          ? entry.youtube_url.trim()
          : "",
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
  return Boolean(
    bg.youtubeUrl || bg.posterUrl || bg.videoUrl || bg.videoUrlMobile,
  );
}

/** Extract an 11-char YouTube video id from common URL shapes or a bare id. */
export function parseYouTubeVideoId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^[\w-]{11}$/.test(raw)) return raw;

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
      return /^[\w-]{11}$/.test(id) ? id : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const v = url.searchParams.get("v");
      if (v && /^[\w-]{11}$/.test(v)) return v;

      const parts = url.pathname.split("/").filter(Boolean);
      const embedIdx = parts.findIndex((p) => p === "embed" || p === "shorts" || p === "live" || p === "v");
      if (embedIdx >= 0) {
        const id = parts[embedIdx + 1] ?? "";
        if (/^[\w-]{11}$/.test(id)) return id;
      }
    }
  } catch {
    return null;
  }

  return null;
}

/** Muted autoplay + loop embed URL (playlist=id required for loop). */
export function buildYouTubeBackgroundEmbedUrl(videoId: string): string {
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    controls: "0",
    playsinline: "1",
    loop: "1",
    playlist: videoId,
    modestbranding: "1",
    rel: "0",
    iv_load_policy: "3",
    disablekb: "1",
    fs: "0",
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
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
