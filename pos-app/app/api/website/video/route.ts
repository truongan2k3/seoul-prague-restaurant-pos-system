import { NextResponse } from "next/server";
import { canManageStaff, normalizeStaffRole } from "@/lib/staff-roles";
import type { VideoSlot } from "@/lib/website/types";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";
import { mapVideoRow } from "@/src/lib/website-public";

export const runtime = "nodejs";

const SLOTS: VideoSlot[] = ["hero", "promo", "atmosphere"];

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
      {
        error: `Could not read upload: ${errorMessage(err)}. Try a shorter video or compress the file.`,
      },
      { status: 400 },
    );
  }

  const title = String(form.get("title") ?? "").trim() || "Promo video";
  const description = String(form.get("description") ?? "").trim();
  const slotRaw = String(form.get("slot") ?? "promo").trim() as VideoSlot;
  const slot = SLOTS.includes(slotRaw) ? slotRaw : "promo";
  const file = form.get("file");
  const poster = form.get("poster");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Missing video file." }, { status: 400 });
  }
  if (!file.type.startsWith("video/")) {
    return NextResponse.json({ error: "File must be a video (MP4 / WebM)." }, { status: 400 });
  }

  const bucketError = await ensureBucket(admin);
  if (bucketError) {
    return NextResponse.json({ error: `Storage bucket missing: ${bucketError}` }, { status: 500 });
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || "mp4";
  const path = `videos/${Date.now()}.${extension}`;
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
  let posterUrl = "";
  if (poster instanceof File && poster.size > 0) {
    const posterExt = poster.name.split(".").pop()?.toLowerCase() || "jpg";
    const posterPath = `videos/posters/${Date.now()}.${posterExt}`;
    const posterBuffer = Buffer.from(await poster.arrayBuffer());
    await admin.storage.from("restaurant_media").upload(posterPath, posterBuffer, {
      cacheControl: "31536000",
      upsert: true,
      contentType: poster.type || undefined,
    });
    posterUrl = admin.storage.from("restaurant_media").getPublicUrl(posterPath).data.publicUrl;
  }

  const { data, error: dbError } = await admin
    .from("website_videos")
    .insert({
      title,
      description,
      video_url: publicData.publicUrl,
      poster_url: posterUrl || null,
      slot,
      sort_order: Date.now(),
      enabled: true,
      updated_at: new Date().toISOString(),
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
    data: mapVideoRow(data as Record<string, unknown>),
    warning:
      file.size > 80 * 1024 * 1024
        ? `Large video (${(file.size / 1024 / 1024).toFixed(1)} MB). Compress for faster page loads.`
        : null,
  });
}
