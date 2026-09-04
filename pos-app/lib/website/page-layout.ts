import type {
  WebsitePageSection,
  WebsitePromoSlideshow,
  WebsiteSectionType,
  WebsiteTypeScaleSize,
  WebsiteBodyScaleSize,
  WebsiteDevice,
} from "@/lib/website/types";

export const BUILTIN_SECTION_TYPES: WebsiteSectionType[] = [
  "hero",
  "about",
  "signature",
  "experience",
  "menu",
  "gallery",
  "video",
  "amenities",
  "contact",
];

export const ADDABLE_SECTION_TYPES: WebsiteSectionType[] = [
  "promo_slideshow",
  "custom_text",
  "custom_cta",
  "spacer",
];

export const SECTION_LABELS: Record<WebsiteSectionType, string> = {
  hero: "Hero",
  promo_slideshow: "Event slideshow",
  about: "About / Story",
  signature: "Signature dishes",
  experience: "Experience",
  menu: "Menu preview",
  gallery: "Gallery",
  video: "Video",
  amenities: "Amenities",
  contact: "Contact",
  custom_text: "Text block",
  custom_cta: "Call to action",
  spacer: "Spacer",
};

export const HEADLINE_SIZE: Record<
  WebsiteTypeScaleSize,
  { mobile: string; desktop: string; preview: string }
> = {
  sm: { mobile: "text-2xl", desktop: "lg:text-4xl", preview: "text-3xl" },
  md: { mobile: "text-3xl", desktop: "lg:text-5xl", preview: "text-4xl" },
  lg: { mobile: "text-4xl", desktop: "lg:text-6xl", preview: "text-5xl" },
  xl: { mobile: "text-5xl", desktop: "lg:text-7xl", preview: "text-6xl" },
  "2xl": { mobile: "text-5xl", desktop: "lg:text-8xl", preview: "text-7xl" },
};

export const BODY_SIZE: Record<
  WebsiteBodyScaleSize,
  { mobile: string; desktop: string; preview: string }
> = {
  sm: { mobile: "text-sm", desktop: "lg:text-sm", preview: "text-sm" },
  md: { mobile: "text-base", desktop: "lg:text-base", preview: "text-base" },
  lg: { mobile: "text-lg", desktop: "lg:text-lg", preview: "text-lg" },
};

export const PADDING_CLASS: Record<"compact" | "normal" | "spacious", string> = {
  compact: "py-12 lg:py-16",
  normal: "py-24 lg:py-32",
  spacious: "py-32 lg:py-40",
};

export const HEADLINE_SCALE_CLASS: Record<
  WebsiteDevice,
  Record<WebsiteTypeScaleSize, string>
> = {
  desktop: {
    sm: HEADLINE_SIZE.sm.preview,
    md: HEADLINE_SIZE.md.preview,
    lg: HEADLINE_SIZE.lg.preview,
    xl: HEADLINE_SIZE.xl.preview,
    "2xl": HEADLINE_SIZE["2xl"].preview,
  },
  mobile: {
    sm: HEADLINE_SIZE.sm.mobile,
    md: HEADLINE_SIZE.md.mobile,
    lg: HEADLINE_SIZE.lg.mobile,
    xl: HEADLINE_SIZE.xl.mobile,
    "2xl": HEADLINE_SIZE["2xl"].mobile,
  },
};

export const BODY_SCALE_CLASS: Record<
  WebsiteDevice,
  Record<WebsiteBodyScaleSize, string>
> = {
  desktop: {
    sm: BODY_SIZE.sm.preview,
    md: BODY_SIZE.md.preview,
    lg: BODY_SIZE.lg.preview,
  },
  mobile: {
    sm: BODY_SIZE.sm.mobile,
    md: BODY_SIZE.md.mobile,
    lg: BODY_SIZE.lg.mobile,
  },
};

function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createDefaultPageLayout(): WebsitePageSection[] {
  const types: WebsiteSectionType[] = [
    "hero",
    "promo_slideshow",
    "about",
    "signature",
    "experience",
    "menu",
    "gallery",
    "video",
    "amenities",
    "contact",
  ];
  return types.map((type, index) => ({
    id: `sec-${type}`,
    type,
    enabled: type !== "promo_slideshow",
    sortOrder: index,
    desktop: { typeScale: { headline: "lg", body: "md" }, padding: "normal" },
    mobile: { typeScale: { headline: "md", body: "md" }, padding: "normal" },
    props:
      type === "promo_slideshow"
        ? { slideshowId: "promo-main", eyebrow: "Events" }
        : type === "experience"
          ? {
              eyebrow: "Experience",
              headline: "An evening at the grill",
              body: "Charcoal heat, shared plates, and the rhythm of Korean barbecue.",
            }
          : undefined,
  }));
}

export function createDefaultPromoSlideshows(): WebsitePromoSlideshow[] {
  return [
    {
      id: "promo-main",
      name: "Homepage events",
      enabled: true,
      autoplayMs: 5200,
      slides: [],
    },
  ];
}

export function createPageSection(type: WebsiteSectionType): WebsitePageSection {
  return {
    id: newId(type),
    type,
    enabled: true,
    sortOrder: 999,
    desktop: { typeScale: { headline: "lg", body: "md" }, padding: "normal" },
    mobile: { typeScale: { headline: "md", body: "md" }, padding: "normal" },
    props:
      type === "promo_slideshow"
        ? { slideshowId: "promo-main", eyebrow: "Events" }
        : type === "custom_text"
          ? {
              eyebrow: "Spotlight",
              headline: "New headline",
              body: "Tell your guests about a special evening, seasonal menu, or celebration.",
              background: "charcoal",
            }
          : type === "custom_cta"
            ? {
                eyebrow: "Reserve",
                headline: "Book your table",
                body: "Private dining and weekend evenings fill quickly.",
                ctaLabel: "Make a reservation",
                ctaHref: "/reservation",
                background: "warm",
              }
            : type === "spacer"
              ? { background: "dark" }
              : undefined,
  };
}

export function normalizePageLayout(value: unknown): WebsitePageSection[] {
  if (!Array.isArray(value) || value.length === 0) return createDefaultPageLayout();
  const parsed: WebsitePageSection[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const entry = row as Record<string, unknown>;
    const type = entry.type as WebsiteSectionType;
    if (!type || !(type in SECTION_LABELS)) continue;
    parsed.push({
      id: typeof entry.id === "string" ? entry.id : newId(type),
      type,
      enabled: entry.enabled !== false,
      sortOrder: typeof entry.sortOrder === "number" ? entry.sortOrder : parsed.length,
      desktop: (entry.desktop as WebsitePageSection["desktop"]) ?? {
        typeScale: { headline: "lg", body: "md" },
        padding: "normal",
      },
      mobile: (entry.mobile as WebsitePageSection["mobile"]) ?? {
        typeScale: { headline: "md", body: "md" },
        padding: "normal",
      },
      props: (entry.props as WebsitePageSection["props"]) ?? undefined,
    });
  }
  if (parsed.length === 0) return createDefaultPageLayout();
  return parsed.sort((a, b) => a.sortOrder - b.sortOrder);
}

export function normalizePromoSlideshows(value: unknown): WebsitePromoSlideshow[] {
  if (!Array.isArray(value) || value.length === 0) return createDefaultPromoSlideshows();
  const parsed: WebsitePromoSlideshow[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const entry = row as Record<string, unknown>;
    const slidesRaw = Array.isArray(entry.slides) ? entry.slides : [];
    parsed.push({
      id: typeof entry.id === "string" ? entry.id : newId("slideshow"),
      name: typeof entry.name === "string" ? entry.name : "Events",
      enabled: entry.enabled !== false,
      autoplayMs:
        typeof entry.autoplayMs === "number" && entry.autoplayMs >= 2000
          ? entry.autoplayMs
          : 5200,
      slides: slidesRaw
        .filter((slide): slide is Record<string, unknown> => Boolean(slide && typeof slide === "object"))
        .map((slide, index) => ({
          id: typeof slide.id === "string" ? slide.id : newId("slide"),
          title: typeof slide.title === "string" ? slide.title : "",
          subtitle: typeof slide.subtitle === "string" ? slide.subtitle : "",
          imageUrl: typeof slide.imageUrl === "string" ? slide.imageUrl : "",
          ctaLabel: typeof slide.ctaLabel === "string" ? slide.ctaLabel : undefined,
          ctaHref: typeof slide.ctaHref === "string" ? slide.ctaHref : undefined,
          enabled: slide.enabled !== false,
          sortOrder: typeof slide.sortOrder === "number" ? slide.sortOrder : index,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    });
  }
  return parsed.length > 0 ? parsed : createDefaultPromoSlideshows();
}

export function sectionDeviceStyle(
  section: WebsitePageSection,
  device: WebsiteDevice,
) {
  return device === "mobile" ? section.mobile : section.desktop;
}

export function headlineClassForSection(section: WebsitePageSection, device: WebsiteDevice) {
  const scale = sectionDeviceStyle(section, device)?.typeScale?.headline ?? "lg";
  return HEADLINE_SCALE_CLASS[device][scale];
}

export function bodyClassForSection(section: WebsitePageSection, device: WebsiteDevice) {
  const scale = sectionDeviceStyle(section, device)?.typeScale?.body ?? "md";
  return BODY_SCALE_CLASS[device][scale];
}

export function paddingClassForSection(section: WebsitePageSection, device: WebsiteDevice) {
  const padding = sectionDeviceStyle(section, device)?.padding ?? "normal";
  return PADDING_CLASS[padding];
}

/** Responsive padding using mobile as base, desktop from lg. */
export function responsivePaddingClass(section: WebsitePageSection) {
  const mobile = section.mobile?.padding ?? "normal";
  const desktop = section.desktop?.padding ?? "normal";
  const mobileMap = {
    compact: "py-12",
    normal: "py-20",
    spacious: "py-28",
  } as const;
  const desktopMap = {
    compact: "lg:py-16",
    normal: "lg:py-32",
    spacious: "lg:py-40",
  } as const;
  return `${mobileMap[mobile]} ${desktopMap[desktop]}`;
}

export function responsiveHeadlineClass(section: WebsitePageSection) {
  const mobile = section.mobile?.typeScale?.headline ?? "md";
  const desktop = section.desktop?.typeScale?.headline ?? "lg";
  return `${HEADLINE_SIZE[mobile].mobile} ${HEADLINE_SIZE[desktop].desktop}`;
}

export function responsiveBodyClass(section: WebsitePageSection) {
  const mobile = section.mobile?.typeScale?.body ?? "md";
  const desktop = section.desktop?.typeScale?.body ?? "md";
  return `${BODY_SIZE[mobile].mobile} ${BODY_SIZE[desktop].desktop}`;
}

export function sectionVisibilityClass(section: WebsitePageSection) {
  const mobileHidden = Boolean(section.mobile?.hidden);
  const desktopHidden = Boolean(section.desktop?.hidden);
  if (mobileHidden && desktopHidden) return "hidden";
  if (mobileHidden) return "hidden lg:block";
  if (desktopHidden) return "lg:hidden";
  return "";
}

export function isSectionVisible(section: WebsitePageSection, device: WebsiteDevice) {
  if (!section.enabled) return false;
  return !sectionDeviceStyle(section, device)?.hidden;
}
