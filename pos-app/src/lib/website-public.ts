import {
  DEFAULT_AMENITIES,
  DEFAULT_MENU_CATEGORIES,
  DEFAULT_MENU_ITEMS,
  DEFAULT_OPENING_HOURS,
  DEFAULT_WEBSITE_SETTINGS,
  defaultWebsiteContent,
  emptyWebsiteMedia,
} from "@/lib/website/defaults";
import type {
  GalleryCategory,
  VideoSlot,
  WebsiteAmenity,
  WebsiteContent,
  WebsiteGalleryItem,
  WebsiteMediaAsset,
  WebsiteMediaSlot,
  WebsiteMenuCategory,
  WebsiteMenuItem,
  WebsiteMenuPdf,
  WebsiteOpeningHour,
  WebsiteSettings,
  WebsiteVideo,
  MenuPdfLanguage,
} from "@/lib/website/types";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";

function parseOpeningHours(value: unknown): WebsiteOpeningHour[] {
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_OPENING_HOURS;
  const days = new Set<string>();
  const parsed: WebsiteOpeningHour[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const entry = row as Record<string, unknown>;
    const day = entry.day;
    if (typeof day !== "string") continue;
    days.add(day);
    parsed.push({
      day: day as WebsiteOpeningHour["day"],
      open: typeof entry.open === "string" ? entry.open : "11:00",
      close: typeof entry.close === "string" ? entry.close : "22:00",
      closed: Boolean(entry.closed),
      note: typeof entry.note === "string" ? entry.note : undefined,
    });
  }
  if (parsed.length === 0) return DEFAULT_OPENING_HOURS;
  for (const fallback of DEFAULT_OPENING_HOURS) {
    if (!days.has(fallback.day)) parsed.push(fallback);
  }
  return parsed.sort(
    (a, b) =>
      DEFAULT_OPENING_HOURS.findIndex((row) => row.day === a.day) -
      DEFAULT_OPENING_HOURS.findIndex((row) => row.day === b.day),
  );
}

function mapSettingsRow(row: Record<string, unknown> | null): WebsiteSettings {
  if (!row) return DEFAULT_WEBSITE_SETTINGS;
  return {
    restaurantName:
      (row.restaurant_name as string) || DEFAULT_WEBSITE_SETTINGS.restaurantName,
    tagline: (row.tagline as string) || DEFAULT_WEBSITE_SETTINGS.tagline,
    description: (row.description as string) || DEFAULT_WEBSITE_SETTINGS.description,
    aboutStory: (row.about_story as string) || DEFAULT_WEBSITE_SETTINGS.aboutStory,
    phone: (row.phone as string) || DEFAULT_WEBSITE_SETTINGS.phone,
    email: (row.email as string) || DEFAULT_WEBSITE_SETTINGS.email,
    address: (row.address as string) || DEFAULT_WEBSITE_SETTINGS.address,
    googleMapsUrl: (row.google_maps_url as string) || DEFAULT_WEBSITE_SETTINGS.googleMapsUrl,
    heroHeadline: (row.hero_headline as string) || DEFAULT_WEBSITE_SETTINGS.heroHeadline,
    heroTagline: (row.hero_tagline as string) || DEFAULT_WEBSITE_SETTINGS.heroTagline,
    heroDescription:
      (row.hero_description as string) || DEFAULT_WEBSITE_SETTINGS.heroDescription,
    instagramUrl: (row.instagram_url as string) || "",
    facebookUrl: (row.facebook_url as string) || "",
    tiktokUrl: (row.tiktok_url as string) || "",
    seoTitle: (row.seo_title as string) || DEFAULT_WEBSITE_SETTINGS.seoTitle,
    seoDescription:
      (row.seo_description as string) || DEFAULT_WEBSITE_SETTINGS.seoDescription,
    seoOgImageUrl: (row.seo_og_image_url as string) || "",
    openingHours: parseOpeningHours(row.opening_hours),
    updatedAt: row.updated_at ? new Date(row.updated_at as string) : undefined,
  };
}

function mapMediaRow(row: Record<string, unknown>): WebsiteMediaAsset {
  return {
    id: row.id as string,
    slot: row.slot as WebsiteMediaSlot,
    fileUrl: row.file_url as string,
    storagePath: (row.storage_path as string) || undefined,
    width: typeof row.width === "number" ? row.width : undefined,
    height: typeof row.height === "number" ? row.height : undefined,
    mimeType: (row.mime_type as string) || undefined,
    altText: (row.alt_text as string) || undefined,
    objectPosition:
      typeof row.object_position === "string" && row.object_position.trim()
        ? row.object_position.trim()
        : "50% 50%",
    updatedAt: row.updated_at ? new Date(row.updated_at as string) : undefined,
  };
}

function mapAmenityRow(row: Record<string, unknown>): WebsiteAmenity {
  return {
    id: row.id as string,
    label: row.label as string,
    icon: (row.icon as string) || "sparkles",
    sortOrder: Number(row.sort_order ?? 0),
    enabled: row.enabled !== false,
  };
}

function mapCategoryRow(row: Record<string, unknown>): WebsiteMenuCategory {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    sortOrder: Number(row.sort_order ?? 0),
    enabled: row.enabled !== false,
  };
}

function mapMenuItemRow(row: Record<string, unknown>): WebsiteMenuItem {
  return {
    id: row.id as string,
    categoryId: (row.category_id as string) || "",
    name: row.name as string,
    description: (row.description as string) || "",
    price: row.price != null ? Number(row.price) : null,
    currency: (row.currency as string) || "CZK",
    imageUrl: (row.image_url as string) || "",
    featured: row.featured === true,
    available: row.available !== false,
    sortOrder: Number(row.sort_order ?? 0),
    badge: (row.badge as string) || "",
  };
}

function mapMenuPdfRow(row: Record<string, unknown>): WebsiteMenuPdf {
  return {
    id: row.id as string,
    language: row.language as MenuPdfLanguage,
    label: row.label as string,
    fileUrl: row.file_url as string,
    storagePath: (row.storage_path as string) || undefined,
    pageCount: typeof row.page_count === "number" ? row.page_count : undefined,
    fileSize: typeof row.file_size === "number" ? row.file_size : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at as string) : undefined,
  };
}

function mapGalleryRow(row: Record<string, unknown>): WebsiteGalleryItem {
  return {
    id: row.id as string,
    category: (row.category as GalleryCategory) || "food",
    title: (row.title as string) || "",
    imageUrl: row.image_url as string,
    storagePath: (row.storage_path as string) || undefined,
    sortOrder: Number(row.sort_order ?? 0),
    featured: row.featured === true,
  };
}

function mapVideoRow(row: Record<string, unknown>): WebsiteVideo {
  return {
    id: row.id as string,
    title: (row.title as string) || "",
    description: (row.description as string) || "",
    videoUrl: row.video_url as string,
    posterUrl: (row.poster_url as string) || "",
    slot: (row.slot as VideoSlot) || "promo",
    sortOrder: Number(row.sort_order ?? 0),
    enabled: row.enabled !== false,
  };
}

/** Public read for /landing — uses admin client; tables may not exist until SQL patch is applied. */
export async function fetchWebsiteContent(): Promise<WebsiteContent> {
  const fallback = defaultWebsiteContent();

  try {
    const admin = createSupabaseAdmin();
    const [
      settingsRes,
      mediaRes,
      amenitiesRes,
      categoriesRes,
      itemsRes,
      menuPdfsRes,
      galleryRes,
      videosRes,
    ] = await Promise.all([
      admin.from("website_settings").select("*").eq("id", 1).maybeSingle(),
      admin.from("website_media_assets").select("*"),
      admin.from("website_amenities").select("*").order("sort_order"),
      admin.from("website_menu_categories").select("*").order("sort_order"),
      admin.from("website_menu_items").select("*").order("sort_order"),
      admin.from("website_menu_pdfs").select("*").order("language"),
      admin.from("website_gallery_items").select("*").order("sort_order"),
      admin.from("website_videos").select("*").order("sort_order"),
    ]);

    if (settingsRes.error?.code === "42P01") return fallback;

    const settings = mapSettingsRow(settingsRes.data as Record<string, unknown> | null);
    const media = emptyWebsiteMedia();
    for (const row of mediaRes.data ?? []) {
      const mapped = mapMediaRow(row as Record<string, unknown>);
      if (mapped.slot in media) {
        media[mapped.slot] = mapped;
      }
    }

    const amenities = (amenitiesRes.data ?? []).map((row) =>
      mapAmenityRow(row as Record<string, unknown>),
    );
    const menuCategories = (categoriesRes.data ?? []).map((row) =>
      mapCategoryRow(row as Record<string, unknown>),
    );
    const menuItems = (itemsRes.data ?? []).map((row) =>
      mapMenuItemRow(row as Record<string, unknown>),
    );
    const menuPdfs = (menuPdfsRes.error ? [] : (menuPdfsRes.data ?? [])).map((row) =>
      mapMenuPdfRow(row as Record<string, unknown>),
    );
    if (menuPdfsRes.error && process.env.NODE_ENV !== "production") {
      console.warn("[website] menu pdfs fetch:", menuPdfsRes.error.message);
    }
    const gallery = (galleryRes.data ?? []).map((row) =>
      mapGalleryRow(row as Record<string, unknown>),
    );
    const videos = (videosRes.data ?? []).map((row) =>
      mapVideoRow(row as Record<string, unknown>),
    );

    return {
      settings,
      media,
      amenities: amenities.length > 0 ? amenities : DEFAULT_AMENITIES,
      menuCategories: menuCategories.length > 0 ? menuCategories : DEFAULT_MENU_CATEGORIES,
      menuItems: menuItems.length > 0 ? menuItems : DEFAULT_MENU_ITEMS,
      menuPdfs,
      gallery,
      videos,
    };
  } catch {
    return fallback;
  }
}

export {
  mapSettingsRow,
  mapMediaRow,
  mapAmenityRow,
  mapCategoryRow,
  mapMenuItemRow,
  mapMenuPdfRow,
  mapGalleryRow,
  mapVideoRow,
  parseOpeningHours,
};
