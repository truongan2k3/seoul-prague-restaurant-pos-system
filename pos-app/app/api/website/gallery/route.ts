import { NextResponse } from "next/server";
import { canManageStaff, normalizeStaffRole } from "@/lib/staff-roles";
import type { GalleryCategory } from "@/lib/website/types";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";
import { mapGalleryRow } from "@/src/lib/website-public";

export const runtime = "nodejs";

const CATEGORIES: GalleryCategory[] = [
  "food",
  "interior",
  "exterior",
  "grill",
  "chef",
  "atmosphere",
  "drinks",
  "events",
];

function errorMessage(error: unknown): string {
  if (!error) return "Upload failed.";
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

async function requireAdmin() {
  const businessSession = await readAuthSession();
  const staffSession = await readStaffSession();
  if (!businessSession || !staffSession) {
    return { error: "Authentication required. Please log in again.", admin: null };
  }
  if (!canManageStaff(normalizeStaffRole(staffSession.staffRole))) {
    return { error: "Admin access required.", admin: null };
  }
  try {
    return { error: null, admin: createSupabaseAdmin() };
  } catch (err) {
    return { error: errorMessage(err), admin: null };
  }
}

async function ensureBucket(admin: ReturnType<typeof createSupabaseAdmin>) {
  const { data: buckets } = await admin.storage.listBuckets();
  const exists = (buckets ?? []).some((bucket) => bucket.name === "restaurant_media");
  if (exists) return null;
  const { error } = await admin.storage.createBucket("restaurant_media", { public: true });
  if (error && !/already exists|duplicate/i.test(error.message)) return error.message;
  return null;
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.admin) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }
  const admin = auth.admin;

  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    return NextResponse.json(
      { error: `Could not read upload: ${errorMessage(err)}. Try a smaller file.` },
      { status: 400 },
    );
  }

  const title = String(form.get("title") ?? "").trim();
  const categoryRaw = String(form.get("category") ?? "food").trim() as GalleryCategory;
  const category = CATEGORIES.includes(categoryRaw) ? categoryRaw : "food";
  const file = form.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Gallery accepts images only." }, { status: 400 });
  }

  const bucketError = await ensureBucket(admin);
  if (bucketError) {
    return NextResponse.json({ error: `Storage bucket missing: ${bucketError}` }, { status: 500 });
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `gallery/${Date.now()}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage.from("restaurant_media").upload(path, buffer, {
    cacheControl: "31536000",
    upsert: true,
    contentType: file.type || undefined,
  });
  if (uploadError) {
    return NextResponse.json(
      { error: `Storage upload failed: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const { data: publicData } = admin.storage.from("restaurant_media").getPublicUrl(path);
  const { data, error: dbError } = await admin
    .from("website_gallery_items")
    .insert({
      category,
      title: title || file.name.replace(/\.[^.]+$/, ""),
      image_url: publicData.publicUrl,
      storage_path: path,
      sort_order: Date.now(),
      featured: false,
    })
    .select("*")
    .single();

  if (dbError) {
    return NextResponse.json(
      { error: `Database save failed: ${dbError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    data: mapGalleryRow(data as Record<string, unknown>),
    warning:
      file.size > 20 * 1024 * 1024
        ? `Large image (${(file.size / 1024 / 1024).toFixed(1)} MB). Consider compressing for faster loading.`
        : null,
  });
}
