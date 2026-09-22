import type {
  WebsiteContentBlock,
  WebsiteContentLayout,
  WebsiteBlockImage,
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
  "amenities",
  "contact",
];

export const ADDABLE_SECTION_TYPES: WebsiteSectionType[] = [
  "promo_slideshow",
  "content",
  "custom_text",
  "custom_cta",
  "spacer",
];

/** Sections that support nested content blocks / components. */
export const BLOCK_CAPABLE_SECTION_TYPES: WebsiteSectionType[] = [
  "about",
  "signature",
  "experience",
  "content",
  "custom_text",
];

export const SECTION_LABELS: Record<WebsiteSectionType, string> = {
  hero: "Hero",
  promo_slideshow: "Event slideshow",
  about: "About / Story",
  signature: "Signature dishes",
  experience: "Experience",
  menu: "Menu preview",
  gallery: "Gallery",
  amenities: "Amenities",
  contact: "Contact",
  content: "Content section",
  custom_text: "Text block",
  custom_cta: "Call to action",
  spacer: "Spacer",
};

export const CONTENT_LAYOUTS: {
  id: WebsiteContentLayout;
  label: string;
  hint: string;
  /** Compact visual glyph for admin layout picker (rows of cells). */
  preview: "split-ltr" | "split-rtl" | "stack-itb" | "stack-tib" | "overlay" | "grid" | "cards-2" | "cards-3" | "featured";
}[] = [
  {
    id: "image_left_text_right",
    label: "Image left · Text right",
    hint: "Classic split — photo beside copy",
    preview: "split-ltr",
  },
  {
    id: "text_left_image_right",
    label: "Text left · Image right",
    hint: "Copy first, photo second",
    preview: "split-rtl",
  },
  {
    id: "image_top_text_bottom",
    label: "Image top · Text bottom",
    hint: "Stacked editorial card",
    preview: "stack-itb",
  },
  {
    id: "text_top_image_bottom",
    label: "Text top · Image bottom",
    hint: "Headline first, then media",
    preview: "stack-tib",
  },
  {
    id: "full_width_overlay",
    label: "Full-width image + overlay",
    hint: "Bleed photo with text on top",
    preview: "overlay",
  },
  {
    id: "image_grid",
    label: "Image grid",
    hint: "Multiple photos in a responsive grid",
    preview: "grid",
  },
  {
    id: "cards_2",
    label: "2-column cards",
    hint: "Two equal cards with image + text",
    preview: "cards-2",
  },
  {
    id: "cards_3",
    label: "3-column cards",
    hint: "Three equal cards with image + text",
    preview: "cards-3",
  },
  {
    id: "featured_support",
    label: "Featured large card",
    hint: "One hero dish with supporting cards beside it",
    preview: "featured",
  },
];

/** Layouts that arrange multiple dishes in one grid (Signature collection). */
export const SIGNATURE_COLLECTION_LAYOUTS: WebsiteContentLayout[] = [
  "cards_2",
  "cards_3",
  "featured_support",
  "image_left_text_right",
  "text_left_image_right",
  "image_top_text_bottom",
];

export const CONTENT_LAYOUT_LABELS: Record<WebsiteContentLayout, string> = Object.fromEntries(
  CONTENT_LAYOUTS.map((row) => [row.id, row.label]),
) as Record<WebsiteContentLayout, string>;

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

export function createBlockImage(partial?: Partial<WebsiteBlockImage>): WebsiteBlockImage {
  return {
    id: partial?.id ?? newId("img"),
    url: partial?.url ?? "",
    alt: partial?.alt,
    title: partial?.title,
    body: partial?.body,
    badge: partial?.badge,
    price: partial?.price,
    ctaLabel: partial?.ctaLabel,
    ctaHref: partial?.ctaHref,
    enabled: partial?.enabled !== false,
    objectPosition: partial?.objectPosition ?? "50% 50%",
    sortOrder: partial?.sortOrder ?? 0,
  };
}

export function createContentBlock(
  layout: WebsiteContentLayout = "image_left_text_right",
  partial?: Partial<WebsiteContentBlock>,
): WebsiteContentBlock {
  return {
    id: partial?.id ?? newId("block"),
    enabled: partial?.enabled !== false,
    sortOrder: partial?.sortOrder ?? 0,
    layout,
    eyebrow: partial?.eyebrow ?? "",
    title: partial?.title ?? "New component",
    body: partial?.body ?? "Add your story, dish, or experience details here.",
    ctaLabel: partial?.ctaLabel,
    ctaHref: partial?.ctaHref,
    images: normalizeBlockImages(partial?.images),
  };
}

export function normalizeBlockImages(value: unknown): WebsiteBlockImage[] {
  if (!Array.isArray(value)) return [];
  const parsed: WebsiteBlockImage[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const entry = row as Record<string, unknown>;
    const url = typeof entry.url === "string" ? entry.url : "";
    const title = typeof entry.title === "string" ? entry.title : undefined;
    const body = typeof entry.body === "string" ? entry.body : undefined;
    // Keep draft dishes that have copy but no image yet (admin editor).
    if (!url && !title && !body) continue;
    parsed.push({
      id: typeof entry.id === "string" ? entry.id : newId("img"),
      url,
      alt: typeof entry.alt === "string" ? entry.alt : undefined,
      title,
      body,
      badge: typeof entry.badge === "string" ? entry.badge : undefined,
      price: typeof entry.price === "string" ? entry.price : undefined,
      ctaLabel: typeof entry.ctaLabel === "string" ? entry.ctaLabel : undefined,
      ctaHref: typeof entry.ctaHref === "string" ? entry.ctaHref : undefined,
      enabled: entry.enabled !== false,
      objectPosition:
        typeof entry.objectPosition === "string" ? entry.objectPosition : "50% 50%",
      sortOrder: typeof entry.sortOrder === "number" ? entry.sortOrder : parsed.length,
    });
  }
  return parsed.sort((a, b) => a.sortOrder - b.sortOrder);
}

export function normalizeContentBlocks(value: unknown): WebsiteContentBlock[] {
  if (!Array.isArray(value)) return [];
  const validLayouts = new Set(CONTENT_LAYOUTS.map((row) => row.id));
  const parsed: WebsiteContentBlock[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const entry = row as Record<string, unknown>;
    const layout = entry.layout as WebsiteContentLayout;
    if (!layout || !validLayouts.has(layout)) continue;
    parsed.push({
      id: typeof entry.id === "string" ? entry.id : newId("block"),
      enabled: entry.enabled !== false,
      sortOrder: typeof entry.sortOrder === "number" ? entry.sortOrder : parsed.length,
      layout,
      eyebrow: typeof entry.eyebrow === "string" ? entry.eyebrow : undefined,
      title: typeof entry.title === "string" ? entry.title : undefined,
      body: typeof entry.body === "string" ? entry.body : undefined,
      ctaLabel: typeof entry.ctaLabel === "string" ? entry.ctaLabel : undefined,
      ctaHref: typeof entry.ctaHref === "string" ? entry.ctaHref : undefined,
      images: normalizeBlockImages(entry.images),
    });
  }
  return parsed.sort((a, b) => a.sortOrder - b.sortOrder);
}

function normalizeSectionProps(
  type: WebsiteSectionType,
  props: unknown,
): WebsitePageSection["props"] {
  if (!props || typeof props !== "object") {
    return type === "promo_slideshow"
      ? { slideshowId: "promo-main", eyebrow: "Events" }
      : undefined;
  }
  const entry = props as Record<string, unknown>;
  const blocks = normalizeContentBlocks(entry.blocks);
  const defaultLayout = entry.defaultLayout as WebsiteContentLayout | undefined;
  const validLayouts = new Set(CONTENT_LAYOUTS.map((row) => row.id));
  return {
    eyebrow: typeof entry.eyebrow === "string" ? entry.eyebrow : undefined,
    headline: typeof entry.headline === "string" ? entry.headline : undefined,
    body: typeof entry.body === "string" ? entry.body : undefined,
    ctaLabel: typeof entry.ctaLabel === "string" ? entry.ctaLabel : undefined,
    ctaHref: typeof entry.ctaHref === "string" ? entry.ctaHref : undefined,
    slideshowId: typeof entry.slideshowId === "string" ? entry.slideshowId : undefined,
    background:
      entry.background === "dark" || entry.background === "charcoal" || entry.background === "warm"
        ? entry.background
        : undefined,
    defaultLayout:
      defaultLayout && validLayouts.has(defaultLayout) ? defaultLayout : undefined,
    blocks: blocks.length > 0 ? blocks : undefined,
  };
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
          : type === "signature"
            ? {
                eyebrow: "Signature",
                headline: "Fire & flavour",
                body: "Premium cuts and Korean classics — grilled at your table in an immersive setting.",
                defaultLayout: "cards_3",
              }
            : type === "about"
              ? { defaultLayout: "image_left_text_right" }
              : undefined,
  }));
}

export function createDefaultPromoSlideshows(): WebsitePromoSlideshow[] {
  return [
    {
      id: "promo-main",
      name: "Homepage events",
      // Slides feed the hero fade + optional Event slideshow section.
      enabled: true,
      autoplayMs: 5600,
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
        : type === "content"
          ? {
              eyebrow: "Spotlight",
              headline: "New section",
              body: "Add components below to build this section.",
              defaultLayout: "image_left_text_right",
              blocks: [
                createContentBlock("image_left_text_right", {
                  title: "First component",
                  body: "Upload images and edit copy for this component.",
                }),
              ],
            }
          : type === "custom_text"
            ? {
                eyebrow: "Spotlight",
                headline: "New headline",
                body: "Tell your guests about a special evening, seasonal menu, or celebration.",
                background: "charcoal",
                defaultLayout: "text_top_image_bottom",
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
                : type === "signature"
                  ? {
                      eyebrow: "Signature",
                      headline: "Fire & flavour",
                      body: "Premium cuts and Korean classics.",
                      defaultLayout: "cards_3",
                    }
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
      props: normalizeSectionProps(type, entry.props),
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

export function enabledContentBlocks(section?: WebsitePageSection | null): WebsiteContentBlock[] {
  if (!section?.props?.blocks?.length) return [];
  return section.props.blocks.filter((block) => block.enabled);
}
