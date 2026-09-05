"use server";

import { canManageStaff, normalizeStaffRole } from "@/lib/staff-roles";
import { DEFAULT_OPENING_HOURS, DEFAULT_WEBSITE_SETTINGS } from "@/lib/website/defaults";
import { nextWebsiteSortOrder } from "@/lib/website/sort-order";
import type {
  GalleryCategory,
  MenuPdfLanguage,
  VideoSlot,
  WebsiteAmenity,
  WebsiteGalleryItem,
  WebsiteMediaSlot,
  WebsiteMenuCategory,
  WebsiteMenuItem,
  WebsiteOpeningHour,
  WebsiteSettings,
  WebsiteVideo,
} from "@/lib/website/types";
import { MENU_PDF_LANGUAGES } from "@/lib/website/defaults";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";
import {
  fetchWebsiteContent,
  mapAmenityRow,
  mapCategoryRow,
  mapGalleryRow,
  mapMediaRow,
  mapMenuItemRow,
  mapMenuPdfRow,
  mapSettingsRow,
  mapVideoRow,
  parseOpeningHours,
} from "@/src/lib/website-public";

function nowIso() {
  return new Date().toISOString();
}

/** Postgres uuid columns reject placeholder ids like "amen-wifi" from DEFAULT_AMENITIES. */
function isUuid(value: string | undefined | null): value is string {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function requireWebsiteAdmin() {
  const businessSession = await readAuthSession();
  const staffSession = await readStaffSession();
  if (!businessSession || !staffSession) {
    return { error: new Error("Authentication required.") as Error, admin: null };
  }
  if (!canManageStaff(normalizeStaffRole(staffSession.staffRole))) {
    return { error: new Error("Admin access required.") as Error, admin: null };
  }
  return { error: null, admin: createSupabaseAdmin() };
}

export async function getWebsiteContentForAdmin() {
  const { error } = await requireWebsiteAdmin();
  if (error) return { data: null, error };
  const data = await fetchWebsiteContent();
  return { data, error: null };
}

export async function saveWebsiteSettings(input: Partial<WebsiteSettings>) {
  const { error, admin } = await requireWebsiteAdmin();
  if (error || !admin) return { data: null, error };

  const payload: Record<string, unknown> = { id: 1, updated_at: nowIso() };
  if (input.restaurantName !== undefined) payload.restaurant_name = input.restaurantName;
  if (input.tagline !== undefined) payload.tagline = input.tagline;
  if (input.description !== undefined) payload.description = input.description;
  if (input.aboutStory !== undefined) payload.about_story = input.aboutStory;
  if (input.phone !== undefined) payload.phone = input.phone;
  if (input.email !== undefined) payload.email = input.email;
  if (input.address !== undefined) payload.address = input.address;
  if (input.googleMapsUrl !== undefined) payload.google_maps_url = input.googleMapsUrl;
  if (input.heroHeadline !== undefined) payload.hero_headline = input.heroHeadline;
  if (input.heroTagline !== undefined) payload.hero_tagline = input.heroTagline;
  if (input.heroDescription !== undefined) payload.hero_description = input.heroDescription;
  if (input.instagramUrl !== undefined) payload.instagram_url = input.instagramUrl;
  if (input.facebookUrl !== undefined) payload.facebook_url = input.facebookUrl;
  if (input.tiktokUrl !== undefined) payload.tiktok_url = input.tiktokUrl;
  if (input.socialLinks !== undefined) {
    payload.social_links = input.socialLinks.map((link, index) => ({
      id: link.id,
      platform: link.platform,
      url: link.url,
      sortOrder: link.sortOrder ?? index,
    }));
    // Keep legacy columns in sync for older consumers.
    const byPlatform = (name: string) =>
      input.socialLinks?.find((link) => link.platform === name)?.url ?? "";
    payload.instagram_url = byPlatform("instagram");
    payload.facebook_url = byPlatform("facebook");
    payload.tiktok_url = byPlatform("tiktok");
  }
  if (input.seoTitle !== undefined) payload.seo_title = input.seoTitle;
  if (input.seoDescription !== undefined) payload.seo_description = input.seoDescription;
  if (input.seoOgImageUrl !== undefined) payload.seo_og_image_url = input.seoOgImageUrl;
  if (input.openingHours !== undefined) payload.opening_hours = input.openingHours;
  if (input.pageLayout !== undefined) payload.page_layout = input.pageLayout;
  if (input.promoSlideshows !== undefined) payload.promo_slideshows = input.promoSlideshows;

  const { data, error: dbError } = await admin
    .from("website_settings")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();

  if (dbError) {
    const hint =
      /page_layout|promo_slideshows|social_links/i.test(dbError.message)
        ? " Run supabase/patch-website-page-layout.sql and supabase/patch-website-social-menu-pdf-order.sql if columns are missing."
        : "";
    return { data: null, error: new Error(`${dbError.message}${hint}`) };
  }
  return { data: mapSettingsRow(data as Record<string, unknown>), error: null };
}

export async function saveWebsiteOpeningHours(hours: WebsiteOpeningHour[]) {
  return saveWebsiteSettings({ openingHours: hours.length > 0 ? hours : DEFAULT_OPENING_HOURS });
}

export async function uploadWebsiteMediaSlot(input: {
  slot: WebsiteMediaSlot;
  fileBase64: string;
  fileName: string;
  mimeType: string;
  altText?: string;
}) {
  const { error, admin } = await requireWebsiteAdmin();
  if (error || !admin) return { data: null, error };

  const extension = input.fileName.split(".").pop()?.toLowerCase() ?? "bin";
  const buffer = Buffer.from(input.fileBase64, "base64");
  // No hard size reject — size tips are client-side recommendations only.
  // Real failures (storage quota, network, auth) are returned as errors.

  const path = `${input.slot}/${Date.now()}.${extension}`;
  const { error: uploadError } = await admin.storage
    .from("restaurant_media")
    .upload(path, buffer, {
      cacheControl: "31536000",
      upsert: true,
      contentType: input.mimeType,
    });
  if (uploadError) {
    return {
      data: null,
      error: new Error(`Storage upload failed: ${uploadError.message}`),
    };
  }

  const { data: publicData } = admin.storage.from("restaurant_media").getPublicUrl(path);
  const fileUrl = publicData.publicUrl;

  const { data, error: dbError } = await admin
    .from("website_media_assets")
    .upsert(
      {
        slot: input.slot,
        file_url: fileUrl,
        storage_path: path,
        mime_type: input.mimeType,
        alt_text: input.altText ?? null,
        updated_at: nowIso(),
      },
      { onConflict: "slot" },
    )
    .select("*")
    .single();

  if (dbError) return { data: null, error: dbError };
  return { data: { fileUrl, slot: input.slot }, error: null };
}

export async function updateWebsiteMediaObjectPosition(
  slot: WebsiteMediaSlot,
  objectPosition: string,
) {
  const { error, admin } = await requireWebsiteAdmin();
  if (error || !admin) return { data: null, error };

  const normalized = objectPosition.trim() || "50% 50%";
  const { data, error: dbError } = await admin
    .from("website_media_assets")
    .update({ object_position: normalized, updated_at: nowIso() })
    .eq("slot", slot)
    .select("*")
    .single();

  if (dbError) {
    const missing = /object_position|42703|schema cache/i.test(dbError.message);
    return {
      data: null,
      error: missing
        ? new Error(
            "Column object_position missing. Run supabase/patch-website-media-position.sql",
          )
        : dbError,
    };
  }
  return { data: mapMediaRow(data as Record<string, unknown>), error: null };
}

export async function deleteWebsiteMediaSlot(slot: WebsiteMediaSlot) {
  const { error, admin } = await requireWebsiteAdmin();
  if (error || !admin) return { error };

  const { error: dbError } = await admin.from("website_media_assets").delete().eq("slot", slot);
  return { error: dbError };
}

export async function upsertWebsiteAmenity(input: Omit<WebsiteAmenity, "id"> & { id?: string }) {
  const { error, admin } = await requireWebsiteAdmin();
  if (error || !admin) return { data: null, error };

  const payload: Record<string, unknown> = {
    label: input.label,
    icon: input.icon,
    icon_url: input.iconUrl || null,
    sort_order: input.sortOrder,
    enabled: input.enabled,
    updated_at: nowIso(),
  };
  // Only send id when it is a real UUID — default/demo ids (amen-wifi, …) must insert fresh.
  if (isUuid(input.id)) {
    payload.id = input.id;
  }

  const query = isUuid(input.id)
    ? admin.from("website_amenities").upsert(payload)
    : admin.from("website_amenities").insert(payload);

  const { data, error: dbError } = await query.select("*").single();

  if (dbError) return { data: null, error: dbError };
  return { data: mapAmenityRow(data as Record<string, unknown>), error: null };
}

export async function deleteWebsiteAmenity(id: string) {
  const { error, admin } = await requireWebsiteAdmin();
  if (error || !admin) return { error };
  // Placeholder default ids never hit the DB — treat as already gone.
  if (!isUuid(id)) return { error: null };
  return { error: (await admin.from("website_amenities").delete().eq("id", id)).error };
}

export async function upsertWebsiteMenuCategory(
  input: Omit<WebsiteMenuCategory, "id"> & { id?: string },
) {
  const { error, admin } = await requireWebsiteAdmin();
  if (error || !admin) return { data: null, error };

  const { data, error: dbError } = await admin
    .from("website_menu_categories")
    .upsert({
      id: input.id,
      name: input.name,
      slug: input.slug,
      sort_order: input.sortOrder,
      enabled: input.enabled,
      updated_at: nowIso(),
    })
    .select("*")
    .single();

  if (dbError) return { data: null, error: dbError };
  return { data: mapCategoryRow(data as Record<string, unknown>), error: null };
}

export async function deleteWebsiteMenuCategory(id: string) {
  const { error, admin } = await requireWebsiteAdmin();
  if (error || !admin) return { error };
  return { error: (await admin.from("website_menu_categories").delete().eq("id", id)).error };
}

export async function upsertWebsiteMenuItem(input: Omit<WebsiteMenuItem, "id"> & { id?: string }) {
  const { error, admin } = await requireWebsiteAdmin();
  if (error || !admin) return { data: null, error };

  const { data, error: dbError } = await admin
    .from("website_menu_items")
    .upsert({
      id: input.id,
      category_id: input.categoryId || null,
      name: input.name,
      description: input.description,
      price: input.price,
      currency: input.currency,
      image_url: input.imageUrl,
      featured: input.featured,
      available: input.available,
      sort_order: input.sortOrder,
      badge: input.badge,
      updated_at: nowIso(),
    })
    .select("*")
    .single();

  if (dbError) return { data: null, error: dbError };
  return { data: mapMenuItemRow(data as Record<string, unknown>), error: null };
}

export async function deleteWebsiteMenuItem(id: string) {
  const { error, admin } = await requireWebsiteAdmin();
  if (error || !admin) return { error };
  return { error: (await admin.from("website_menu_items").delete().eq("id", id)).error };
}

export async function uploadWebsiteMenuItemImage(input: {
  itemId: string;
  fileBase64: string;
  fileName: string;
  mimeType: string;
}) {
  const { error, admin } = await requireWebsiteAdmin();
  if (error || !admin) return { data: null, error };

  const extension = input.fileName.split(".").pop()?.toLowerCase() ?? "jpg";
  const buffer = Buffer.from(input.fileBase64, "base64");
  const path = `menu/${input.itemId}-${Date.now()}.${extension}`;
  const { error: uploadError } = await admin.storage
    .from("restaurant_media")
    .upload(path, buffer, { cacheControl: "31536000", upsert: true, contentType: input.mimeType });
  if (uploadError) return { data: null, error: uploadError };

  const { data: publicData } = admin.storage.from("restaurant_media").getPublicUrl(path);
  const { error: dbError } = await admin
    .from("website_menu_items")
    .update({ image_url: publicData.publicUrl, updated_at: nowIso() })
    .eq("id", input.itemId);
  if (dbError) return { data: null, error: dbError };
  return { data: { imageUrl: publicData.publicUrl }, error: null };
}

export async function upsertWebsiteGalleryItem(
  input: Omit<WebsiteGalleryItem, "id"> & { id?: string },
) {
  const { error, admin } = await requireWebsiteAdmin();
  if (error || !admin) return { data: null, error };

  const { data, error: dbError } = await admin
    .from("website_gallery_items")
    .upsert({
      id: input.id,
      category: input.category,
      title: input.title,
      image_url: input.imageUrl,
      storage_path: input.storagePath ?? null,
      sort_order: input.sortOrder,
      featured: input.featured,
      updated_at: nowIso(),
    })
    .select("*")
    .single();

  if (dbError) return { data: null, error: dbError };
  return { data: mapGalleryRow(data as Record<string, unknown>), error: null };
}

export async function uploadWebsiteGalleryImage(input: {
  category: GalleryCategory;
  title?: string;
  fileBase64: string;
  fileName: string;
  mimeType: string;
}) {
  const { error, admin } = await requireWebsiteAdmin();
  if (error || !admin) return { data: null, error };

  const extension = input.fileName.split(".").pop()?.toLowerCase() ?? "jpg";
  const buffer = Buffer.from(input.fileBase64, "base64");
  const path = `gallery/${Date.now()}.${extension}`;
  const { error: uploadError } = await admin.storage
    .from("restaurant_media")
    .upload(path, buffer, { cacheControl: "31536000", upsert: true, contentType: input.mimeType });
  if (uploadError) return { data: null, error: uploadError };

  const { data: publicData } = admin.storage.from("restaurant_media").getPublicUrl(path);
  return upsertWebsiteGalleryItem({
    category: input.category,
    title: input.title ?? "",
    imageUrl: publicData.publicUrl,
    storagePath: path,
    sortOrder: nextWebsiteSortOrder(),
    featured: false,
  });
}

export async function deleteWebsiteGalleryItem(id: string) {
  const { error, admin } = await requireWebsiteAdmin();
  if (error || !admin) return { error };
  return { error: (await admin.from("website_gallery_items").delete().eq("id", id)).error };
}

export async function upsertWebsiteVideo(input: Omit<WebsiteVideo, "id"> & { id?: string }) {
  const { error, admin } = await requireWebsiteAdmin();
  if (error || !admin) return { data: null, error };

  const { data, error: dbError } = await admin
    .from("website_videos")
    .upsert({
      id: input.id,
      title: input.title,
      description: input.description,
      video_url: input.videoUrl,
      poster_url: input.posterUrl,
      slot: input.slot,
      sort_order: input.sortOrder,
      enabled: input.enabled,
      updated_at: nowIso(),
    })
    .select("*")
    .single();

  if (dbError) return { data: null, error: dbError };
  return { data: mapVideoRow(data as Record<string, unknown>), error: null };
}

export async function uploadWebsiteVideoFile(input: {
  title: string;
  description?: string;
  slot: VideoSlot;
  fileBase64: string;
  fileName: string;
  mimeType: string;
  posterBase64?: string;
  posterFileName?: string;
  posterMimeType?: string;
}) {
  const { error, admin } = await requireWebsiteAdmin();
  if (error || !admin) return { data: null, error };

  const extension = input.fileName.split(".").pop()?.toLowerCase() ?? "mp4";
  const buffer = Buffer.from(input.fileBase64, "base64");
  const path = `videos/${Date.now()}.${extension}`;
  const { error: uploadError } = await admin.storage
    .from("restaurant_media")
    .upload(path, buffer, { cacheControl: "31536000", upsert: true, contentType: input.mimeType });
  if (uploadError) return { data: null, error: uploadError };

  const { data: publicData } = admin.storage.from("restaurant_media").getPublicUrl(path);
  let posterUrl = "";
  if (input.posterBase64 && input.posterFileName && input.posterMimeType) {
    const posterExt = input.posterFileName.split(".").pop()?.toLowerCase() ?? "jpg";
    const posterPath = `videos/posters/${Date.now()}.${posterExt}`;
    const posterBuffer = Buffer.from(input.posterBase64, "base64");
    await admin.storage.from("restaurant_media").upload(posterPath, posterBuffer, {
      cacheControl: "31536000",
      upsert: true,
      contentType: input.posterMimeType,
    });
    posterUrl = admin.storage.from("restaurant_media").getPublicUrl(posterPath).data.publicUrl;
  }

  return upsertWebsiteVideo({
    title: input.title,
    description: input.description ?? "",
    videoUrl: publicData.publicUrl,
    posterUrl,
    slot: input.slot,
    sortOrder: nextWebsiteSortOrder(),
    enabled: true,
  });
}

export async function deleteWebsiteVideo(id: string) {
  const { error, admin } = await requireWebsiteAdmin();
  if (error || !admin) return { error };
  return { error: (await admin.from("website_videos").delete().eq("id", id)).error };
}

export async function uploadWebsiteMenuPdf(input: {
  language: MenuPdfLanguage;
  fileBase64: string;
  fileName: string;
  mimeType: string;
  pageCount?: number;
}) {
  const { error, admin } = await requireWebsiteAdmin();
  if (error || !admin) return { data: null, error };

  if (input.mimeType !== "application/pdf") {
    return { data: null, error: new Error("Only PDF files are supported.") };
  }

  const buffer = Buffer.from(input.fileBase64, "base64");
  // Soft size recommendation is UI-only; storage/DB errors are returned to the client.

  const label = MENU_PDF_LANGUAGES.find((row) => row.code === input.language)?.label ?? input.language;
  const path = `menu-pdfs/${input.language}-${Date.now()}.pdf`;
  const { error: uploadError } = await admin.storage
    .from("restaurant_media")
    .upload(path, buffer, {
      cacheControl: "31536000",
      upsert: true,
      contentType: "application/pdf",
    });
  if (uploadError) return { data: null, error: uploadError };

  const { data: publicData } = admin.storage.from("restaurant_media").getPublicUrl(path);
  const { data, error: dbError } = await admin
    .from("website_menu_pdfs")
    .upsert(
      {
        language: input.language,
        label,
        file_url: publicData.publicUrl,
        storage_path: path,
        page_count: input.pageCount ?? null,
        file_size: buffer.length,
        updated_at: nowIso(),
      },
      { onConflict: "language" },
    )
    .select("*")
    .single();

  if (dbError) return { data: null, error: dbError };
  return { data: mapMenuPdfRow(data as Record<string, unknown>), error: null };
}

export async function deleteWebsiteMenuPdf(language: MenuPdfLanguage) {
  const { error, admin } = await requireWebsiteAdmin();
  if (error || !admin) return { error };
  return { error: (await admin.from("website_menu_pdfs").delete().eq("language", language)).error };
}

export async function reorderWebsiteMenuPdfs(orderedIds: string[]) {
  const { error, admin } = await requireWebsiteAdmin();
  if (error || !admin) return { data: null, error };
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { data: null, error: new Error("orderedIds required.") };
  }

  const updates = orderedIds.map((id, index) =>
    admin
      .from("website_menu_pdfs")
      .update({ sort_order: index, updated_at: nowIso() })
      .eq("id", id),
  );
  const results = await Promise.all(updates);
  const firstError = results.find((row) => row.error)?.error;
  if (firstError) {
    const missing =
      /sort_order|does not exist|schema cache/i.test(firstError.message)
        ? " Run supabase/patch-website-social-menu-pdf-order.sql in Supabase SQL editor."
        : "";
    return { data: null, error: new Error(`${firstError.message}${missing}`) };
  }

  const content = await fetchWebsiteContent();
  return { data: content.menuPdfs, error: null };
}

export async function seedWebsiteDefaultsIfEmpty() {
  const { error, admin } = await requireWebsiteAdmin();
  if (error || !admin) return { error };

  const { data: existing } = await admin.from("website_settings").select("id").eq("id", 1).maybeSingle();
  if (!existing) {
    await admin.from("website_settings").insert({
      id: 1,
      restaurant_name: DEFAULT_WEBSITE_SETTINGS.restaurantName,
      tagline: DEFAULT_WEBSITE_SETTINGS.tagline,
      description: DEFAULT_WEBSITE_SETTINGS.description,
      about_story: DEFAULT_WEBSITE_SETTINGS.aboutStory,
      phone: DEFAULT_WEBSITE_SETTINGS.phone,
      email: DEFAULT_WEBSITE_SETTINGS.email,
      address: DEFAULT_WEBSITE_SETTINGS.address,
      google_maps_url: DEFAULT_WEBSITE_SETTINGS.googleMapsUrl,
      hero_headline: DEFAULT_WEBSITE_SETTINGS.heroHeadline,
      hero_tagline: DEFAULT_WEBSITE_SETTINGS.heroTagline,
      hero_description: DEFAULT_WEBSITE_SETTINGS.heroDescription,
      seo_title: DEFAULT_WEBSITE_SETTINGS.seoTitle,
      seo_description: DEFAULT_WEBSITE_SETTINGS.seoDescription,
      opening_hours: parseOpeningHours(DEFAULT_OPENING_HOURS),
      page_layout: DEFAULT_WEBSITE_SETTINGS.pageLayout,
      promo_slideshows: DEFAULT_WEBSITE_SETTINGS.promoSlideshows,
      updated_at: nowIso(),
    });
  }
  return { error: null };
}
