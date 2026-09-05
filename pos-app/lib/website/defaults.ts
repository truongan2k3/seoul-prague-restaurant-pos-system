import { DEFAULT_RESERVATION_GUEST_VENUE } from "@/lib/reservation-guest-form";
import {
  createDefaultPageLayout,
  createDefaultPromoSlideshows,
} from "@/lib/website/page-layout";
import type {
  WebsiteAmenity,
  WebsiteContent,
  WebsiteGalleryItem,
  WebsiteMenuCategory,
  WebsiteMenuItem,
  WebsiteMenuPdf,
  WebsiteOpeningHour,
  WebsiteSettings,
  WebsiteVideo,
  MenuPdfLanguage,
} from "@/lib/website/types";

export const PLACEHOLDER_NOTE =
  "[Placeholder content — edit in /admin or replace with your restaurant details]";

const venue = DEFAULT_RESERVATION_GUEST_VENUE;

export const DEFAULT_OPENING_HOURS: WebsiteOpeningHour[] = [
  { day: "monday", open: "11:00", close: "22:00", closed: false },
  { day: "tuesday", open: "11:00", close: "22:00", closed: false },
  { day: "wednesday", open: "11:00", close: "22:00", closed: false },
  { day: "thursday", open: "11:00", close: "22:00", closed: false },
  { day: "friday", open: "11:00", close: "23:00", closed: false },
  { day: "saturday", open: "11:00", close: "23:00", closed: false },
  { day: "sunday", open: "11:00", close: "22:00", closed: false },
];

export const DEFAULT_WEBSITE_SETTINGS: WebsiteSettings = {
  restaurantName: venue.restaurantName,
  tagline: "Authentic Korean BBQ",
  description:
    "Premium Korean BBQ grilled at your table. An immersive dining experience in the heart of Prague.",
  aboutStory:
    "Experience the ritual of Korean barbecue — premium cuts, charcoal warmth, and shared plates crafted for memorable evenings. " +
    PLACEHOLDER_NOTE,
  phone: venue.phone,
  email: venue.email,
  address: venue.address,
  googleMapsUrl: "https://maps.google.com",
  heroHeadline: "AUTHENTIC KOREAN BBQ",
  heroTagline: "Premium Korean BBQ, grilled at your table.",
  heroDescription:
    "Fire-kissed meats, refined side dishes, and a cinematic dining atmosphere. " + PLACEHOLDER_NOTE,
  instagramUrl: "",
  facebookUrl: "",
  tiktokUrl: "",
  socialLinks: [],
  seoTitle: `${venue.restaurantName} — Premium Korean BBQ in Prague`,
  seoDescription:
    "Book a table for premium Korean BBQ in Prague. Grilled at your table, editorial dining, unforgettable hospitality.",
  seoOgImageUrl: "",
  openingHours: DEFAULT_OPENING_HOURS,
  pageLayout: createDefaultPageLayout(),
  promoSlideshows: createDefaultPromoSlideshows(),
};

export const DEFAULT_AMENITIES: WebsiteAmenity[] = [
  { id: "amen-wifi", label: "Free Wi‑Fi", icon: "wifi", iconUrl: "", sortOrder: 0, enabled: true },
  { id: "amen-ac", label: "Air conditioning", icon: "wind", iconUrl: "", sortOrder: 1, enabled: true },
  { id: "amen-parking", label: "Parking nearby", icon: "car", iconUrl: "", sortOrder: 2, enabled: true },
  { id: "amen-charging", label: "Charging sockets at tables", icon: "plug", iconUrl: "", sortOrder: 3, enabled: true },
  { id: "amen-accessible", label: "Wheelchair accessible", icon: "accessibility", iconUrl: "", sortOrder: 4, enabled: true },
  { id: "amen-private", label: "Private dining", icon: "users", iconUrl: "", sortOrder: 5, enabled: true },
];

export const DEFAULT_MENU_CATEGORIES: WebsiteMenuCategory[] = [
  { id: "cat-beef", name: "Beef", slug: "beef", sortOrder: 0, enabled: true },
  { id: "cat-pork", name: "Pork", slug: "pork", sortOrder: 1, enabled: true },
  { id: "cat-sets", name: "Korean BBQ Sets", slug: "bbq-sets", sortOrder: 2, enabled: true },
  { id: "cat-sides", name: "Side Dishes", slug: "sides", sortOrder: 3, enabled: true },
  { id: "cat-drinks", name: "Drinks", slug: "drinks", sortOrder: 4, enabled: true },
];

export const DEFAULT_MENU_ITEMS: WebsiteMenuItem[] = [
  {
    id: "item-sirloin",
    categoryId: "cat-beef",
    name: "Angus Sirloin",
    description: "Marbled premium cut, grilled at your table. " + PLACEHOLDER_NOTE,
    price: null,
    currency: "CZK",
    imageUrl: "",
    featured: true,
    available: true,
    sortOrder: 0,
    badge: "Signature",
  },
  {
    id: "item-short-rib",
    categoryId: "cat-beef",
    name: "Beef Short Rib",
    description: "Slow-marinated, rich and tender. " + PLACEHOLDER_NOTE,
    price: null,
    currency: "CZK",
    imageUrl: "",
    featured: true,
    available: true,
    sortOrder: 1,
    badge: "Chef's pick",
  },
  {
    id: "item-pork-belly",
    categoryId: "cat-pork",
    name: "Pork Belly",
    description: "Classic Korean BBQ favourite. " + PLACEHOLDER_NOTE,
    price: null,
    currency: "CZK",
    imageUrl: "",
    featured: true,
    available: true,
    sortOrder: 0,
    badge: "",
  },
  {
    id: "item-bbq-set",
    categoryId: "cat-sets",
    name: "Premium BBQ Set",
    description: "Curated selection for sharing. " + PLACEHOLDER_NOTE,
    price: null,
    currency: "CZK",
    imageUrl: "",
    featured: true,
    available: true,
    sortOrder: 0,
    badge: "For two",
  },
];

export const DEFAULT_GALLERY: WebsiteGalleryItem[] = [];

export const DEFAULT_VIDEOS: WebsiteVideo[] = [];

export function emptyWebsiteMedia(): WebsiteContent["media"] {
  return {
    logo: null,
    hero_image: null,
    hero_video: null,
    about_image: null,
    signature_1: null,
    signature_2: null,
    signature_3: null,
  };
}

export const MENU_PDF_LANGUAGES: { code: MenuPdfLanguage; label: string }[] = [
  { code: "cs", label: "Čeština" },
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
];

export function defaultWebsiteContent(): WebsiteContent {
  return {
    settings: DEFAULT_WEBSITE_SETTINGS,
    media: emptyWebsiteMedia(),
    amenities: DEFAULT_AMENITIES,
    menuCategories: DEFAULT_MENU_CATEGORIES,
    menuItems: DEFAULT_MENU_ITEMS,
    menuPdfs: [],
    gallery: DEFAULT_GALLERY,
    videos: DEFAULT_VIDEOS,
  };
}
