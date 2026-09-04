export type WebsiteMediaSlot =
  | "logo"
  | "hero_image"
  | "hero_video"
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

export type VideoSlot = "hero" | "promo" | "atmosphere";

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
  | "video"
  | "amenities"
  | "contact"
  | "custom_text"
  | "custom_cta"
  | "spacer";

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
  seoTitle: string;
  seoDescription: string;
  seoOgImageUrl: string;
  openingHours: WebsiteOpeningHour[];
  /** Ordered homepage sections for the visual designer. */
  pageLayout: WebsitePageSection[];
  /** Event / promo carousels referenced by promo_slideshow sections. */
  promoSlideshows: WebsitePromoSlideshow[];
  updatedAt?: Date;
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

export interface WebsiteVideo {
  id: string;
  title: string;
  description: string;
  videoUrl: string;
  posterUrl: string;
  slot: VideoSlot;
  sortOrder: number;
  enabled: boolean;
}

export interface WebsiteContent {
  settings: WebsiteSettings;
  media: Record<WebsiteMediaSlot, WebsiteMediaAsset | null>;
  amenities: WebsiteAmenity[];
  menuCategories: WebsiteMenuCategory[];
  menuItems: WebsiteMenuItem[];
  menuPdfs: WebsiteMenuPdf[];
  gallery: WebsiteGalleryItem[];
  videos: WebsiteVideo[];
}
