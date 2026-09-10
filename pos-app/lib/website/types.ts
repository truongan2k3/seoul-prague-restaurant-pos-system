export type WebsiteMediaSlot =
  | "logo"
  | "hero_image"
  | "about_image"
  | "signature_1"
  | "signature_2"
  | "signature_3";

export type GalleryCategory =
  | "food"
  | "interior"
  | "exterior"
  | "grill"
  | "chef"
  | "atmosphere"
  | "drinks"
  | "events";

export interface WebsiteOpeningHour {
  day: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
  open: string;
  close: string;
  closed: boolean;
  note?: string;
}

export type WebsiteDevice = "desktop" | "mobile";

export type WebsiteSectionType =
  | "hero"
  | "promo_slideshow"
  | "about"
  | "signature"
  | "experience"
  | "menu"
  | "gallery"
  | "amenities"
  | "contact"
  | "content"
  | "custom_text"
  | "custom_cta"
  | "spacer";

/** Layout variants for reusable content components inside a section. */
export type WebsiteContentLayout =
  | "image_left_text_right"
  | "text_left_image_right"
  | "image_top_text_bottom"
  | "text_top_image_bottom"
  | "full_width_overlay"
  | "image_grid"
  | "cards_2"
  | "cards_3"
  | "featured_support";

export type WebsiteTypeScaleSize = "sm" | "md" | "lg" | "xl" | "2xl";
export type WebsiteBodyScaleSize = "sm" | "md" | "lg";

export interface WebsiteTypeScale {
  headline?: WebsiteTypeScaleSize;
  body?: WebsiteBodyScaleSize;
}

export interface WebsiteSectionDeviceStyle {
  /** Hide this section only on this device. */
  hidden?: boolean;
  typeScale?: WebsiteTypeScale;
  padding?: "compact" | "normal" | "spacious";
}

/** One image inside a content block (admin can reorder / preview). */
export interface WebsiteBlockImage {
  id: string;
  url: string;
  alt?: string;
  /** Optional card title when used in grid / cards layouts. */
  title?: string;
  /** Optional card body when used in grid / cards layouts. */
  body?: string;
  /** Badge / tag shown above the dish title (e.g. Signature, Chef's pick). */
  badge?: string;
  /** Display price string (e.g. "420 Kč" or "from 890"). */
  price?: string;
  ctaLabel?: string;
  ctaHref?: string;
  /** When false, dish is hidden on the landing page. Defaults to true. */
  enabled?: boolean;
  objectPosition?: string;
  sortOrder: number;
}

/**
 * Reusable content component inside a page section.
 * Sections may contain many blocks with different layouts.
 */
export interface WebsiteContentBlock {
  id: string;
  enabled: boolean;
  sortOrder: number;
  layout: WebsiteContentLayout;
  eyebrow?: string;
  title?: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
  images: WebsiteBlockImage[];
}

export interface WebsitePageSection {
  id: string;
  type: WebsiteSectionType;
  enabled: boolean;
  sortOrder: number;
  desktop?: WebsiteSectionDeviceStyle;
  mobile?: WebsiteSectionDeviceStyle;
  props?: {
    eyebrow?: string;
    headline?: string;
    body?: string;
    ctaLabel?: string;
    ctaHref?: string;
    slideshowId?: string;
    background?: "dark" | "charcoal" | "warm";
    /** Default layout when adding a new block in this section. */
    defaultLayout?: WebsiteContentLayout;
    /** Flexible content components (text + images + layout). */
    blocks?: WebsiteContentBlock[];
  };
}

export interface WebsitePromoSlide {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  ctaLabel?: string;
  ctaHref?: string;
  enabled: boolean;
  sortOrder: number;
}

export interface WebsitePromoSlideshow {
  id: string;
  name: string;
  enabled: boolean;
  autoplayMs: number;
  slides: WebsitePromoSlide[];
}

export interface WebsiteSocialLink {
  id: string;
  platform: string;
  url: string;
  sortOrder: number;
}

export interface WebsiteSettings {
  restaurantName: string;
  tagline: string;
  description: string;
  aboutStory: string;
  phone: string;
  email: string;
  address: string;
  googleMapsUrl: string;
  heroHeadline: string;
  heroTagline: string;
  heroDescription: string;
  instagramUrl: string;
  facebookUrl: string;
  tiktokUrl: string;
  /** Configurable social platforms (preferred over legacy URL fields). */
  socialLinks: WebsiteSocialLink[];
  seoTitle: string;
  seoDescription: string;
  seoOgImageUrl: string;
  openingHours: WebsiteOpeningHour[];
  /** Ordered homepage sections for the section builder. */
  pageLayout: WebsitePageSection[];
  /** Event / promo carousels referenced by promo_slideshow sections. */
  promoSlideshows: WebsitePromoSlideshow[];
  /** Cinematic background for guest /reservation pages. */
  reservationBackground: WebsiteReservationBackground;
  updatedAt?: Date;
}

/** Guest reservation page full-bleed background media. */
export interface WebsiteReservationBackground {
  enabled: boolean;
  /** Primary loop (WebM/MP4 preferred). Served on desktop / as fallback. */
  videoUrl: string;
  /** Optional lighter mobile loop to cut bandwidth. */
  videoUrlMobile: string;
  /** Poster / still fallback (also used under video & when autoplay fails). */
  posterUrl: string;
  /** Dark overlay strength 0–90 so form text stays readable. */
  overlayOpacity: number;
  /** CSS object-position for desktop crop. */
  objectPosition: string;
  /** CSS object-position for mobile portrait crop. */
  objectPositionMobile: string;
}

export interface WebsiteMediaAsset {
  id: string;
  slot: WebsiteMediaSlot;
  fileUrl: string;
  storagePath?: string;
  width?: number;
  height?: number;
  mimeType?: string;
  altText?: string;
  /** CSS object-position, e.g. "50% 40%" */
  objectPosition?: string;
  updatedAt?: Date;
}

export interface WebsiteAmenity {
  id: string;
  label: string;
  icon: string;
  /** Custom PNG/SVG icon URL (preferred over lucide `icon` name). */
  iconUrl: string;
  sortOrder: number;
  enabled: boolean;
}

export interface WebsiteMenuCategory {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  enabled: boolean;
}

export interface WebsiteMenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number | null;
  currency: string;
  imageUrl: string;
  featured: boolean;
  available: boolean;
  sortOrder: number;
  badge: string;
}

export type MenuPdfLanguage = "cs" | "en" | "zh";

export interface WebsiteMenuPdf {
  id: string;
  language: MenuPdfLanguage;
  label: string;
  fileUrl: string;
  storagePath?: string;
  pageCount?: number;
  fileSize?: number;
  /** Admin drag order. When all zero, English is shown first by default. */
  sortOrder: number;
  updatedAt?: Date;
}

export interface WebsiteGalleryItem {
  id: string;
  category: GalleryCategory;
  title: string;
  imageUrl: string;
  storagePath?: string;
  sortOrder: number;
  featured: boolean;
}


export interface WebsiteContent {
  settings: WebsiteSettings;
  media: Record<WebsiteMediaSlot, WebsiteMediaAsset | null>;
  amenities: WebsiteAmenity[];
  menuCategories: WebsiteMenuCategory[];
  menuItems: WebsiteMenuItem[];
  menuPdfs: WebsiteMenuPdf[];
  gallery: WebsiteGalleryItem[];
}
