import type { WebsiteSocialLink } from "@/lib/website/types";

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X",
  twitter: "X",
  tripadvisor: "TripAdvisor",
  google: "Google",
  other: "Website",
};

export function socialPlatformLabel(platform: string): string {
  const key = platform.trim().toLowerCase();
  return PLATFORM_LABELS[key] ?? (platform.trim() || "Link");
}

export function normalizeSocialLinks(value: unknown): WebsiteSocialLink[] {
  if (!Array.isArray(value)) return [];
  const links: WebsiteSocialLink[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const entry = row as Record<string, unknown>;
    const url = typeof entry.url === "string" ? entry.url.trim() : "";
    if (!url) continue;
    const platform =
      typeof entry.platform === "string" && entry.platform.trim()
        ? entry.platform.trim().toLowerCase()
        : "other";
    links.push({
      id:
        typeof entry.id === "string" && entry.id
          ? entry.id
          : `social-${platform}-${links.length}`,
      platform,
      url,
      sortOrder: Number(entry.sortOrder ?? entry.sort_order ?? links.length),
    });
  }
  return links.sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Build social links from legacy Instagram/Facebook/TikTok URL columns when social_links is empty. */
export function socialLinksFromLegacy(input: {
  instagramUrl?: string;
  facebookUrl?: string;
  tiktokUrl?: string;
}): WebsiteSocialLink[] {
  const links: WebsiteSocialLink[] = [];
  const push = (platform: string, url: string | undefined) => {
    const trimmed = url?.trim();
    if (!trimmed) return;
    links.push({
      id: `legacy-${platform}`,
      platform,
      url: trimmed,
      sortOrder: links.length,
    });
  };
  push("instagram", input.instagramUrl);
  push("facebook", input.facebookUrl);
  push("tiktok", input.tiktokUrl);
  return links;
}

export function resolveSocialLinks(input: {
  socialLinks?: WebsiteSocialLink[];
  instagramUrl?: string;
  facebookUrl?: string;
  tiktokUrl?: string;
}): WebsiteSocialLink[] {
  if (input.socialLinks && input.socialLinks.length > 0) {
    return [...input.socialLinks].sort((a, b) => a.sortOrder - b.sortOrder);
  }
  return socialLinksFromLegacy(input);
}

export const SOCIAL_PLATFORM_OPTIONS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "x", label: "X (Twitter)" },
  { value: "tripadvisor", label: "TripAdvisor" },
  { value: "google", label: "Google" },
  { value: "other", label: "Other" },
] as const;
