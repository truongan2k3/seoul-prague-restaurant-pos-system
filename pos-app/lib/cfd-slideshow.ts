import type { AppSettings, CfdSlideshowItem, CfdSlideshowMediaType } from "@/lib/types";

export const CFD_IMAGE_DEFAULT_SECONDS = 12;

export function inferCfdMediaType(url: string): CfdSlideshowMediaType {
  const trimmed = url.trim();
  if (/\.gif(\?|#|$)/i.test(trimmed)) return "gif";
  if (/\.(mp4|webm)(\?|#|$)/i.test(trimmed)) return "video";
  return "image";
}

export function cfdSlideshowItemDuration(item: CfdSlideshowItem): number {
  if (item.type === "video") return 0;
  return item.durationSeconds ?? CFD_IMAGE_DEFAULT_SECONDS;
}

export function resolveCfdSlideshow(
  settings: Pick<AppSettings, "cfdAdSlideshow" | "cfdAdVideoUrl">,
): CfdSlideshowItem[] {
  if (settings.cfdAdSlideshow.length > 0) {
    return settings.cfdAdSlideshow.map((item) => ({
      ...item,
      durationSeconds:
        item.type === "image" || item.type === "gif"
          ? item.durationSeconds ?? CFD_IMAGE_DEFAULT_SECONDS
          : item.durationSeconds,
    }));
  }

  const legacy = settings.cfdAdVideoUrl.trim();
  if (!legacy) return [];

  const type = inferCfdMediaType(legacy);
  return [
    {
      id: "legacy-cfd-ad",
      url: legacy,
      type,
      durationSeconds:
        type === "image" || type === "gif" ? CFD_IMAGE_DEFAULT_SECONDS : undefined,
    },
  ];
}
