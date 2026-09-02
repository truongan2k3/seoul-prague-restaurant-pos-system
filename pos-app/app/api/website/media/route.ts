import { NextResponse } from "next/server";
import { canManageStaff, normalizeStaffRole } from "@/lib/staff-roles";
import type { WebsiteMediaSlot } from "@/lib/website/types";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";
import { mapMediaRow } from "@/src/lib/website-public";

export const runtime = "nodejs";

const SLOTS: WebsiteMediaSlot[] = [
  "logo",
  "hero_image",
  "hero_video",
  "about_image",
  "signature_1",
  "signature_2",
  "signature_3",
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
      { error: `Could not read upload: ${errorMessage(err)}` },
      { status: 400 },
    );
  }

  const slot = String(form.get("slot") ?? "").trim() as WebsiteMediaSlot;
  const altText = String(form.get("altText") ?? "").trim();
  const file = form.get("file");

  if (!SLOTS.includes(slot)) {
    return NextResponse.json({ error: "Invalid media slot." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${slot}/${Date.now()}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { data: buckets } = await admin.storage.listBuckets();
  const exists = (buckets ?? []).some((bucket) => bucket.name === "restaurant_media");
  if (!exists) {
    const { error: createError } = await admin.storage.createBucket("restaurant_media", {
      public: true,
    });
    if (createError && !/already exists|duplicate/i.test(createError.message)) {
      return NextResponse.json(
        { error: `Storage bucket missing: ${createError.message}` },
        { status: 500 },
      );
    }
  }

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
    .from("website_media_assets")
    .upsert(
      {
        slot,
        file_url: publicData.publicUrl,
        storage_path: path,
        mime_type: file.type || null,
        alt_text: altText || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slot" },
    )
    .select("*")
    .single();

  if (dbError) {
    return NextResponse.json(
      { error: `Database save failed: ${dbError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    data: mapMediaRow(data as Record<string, unknown>),
    warning:
      file.size > 50 * 1024 * 1024
        ? `Large file (${(file.size / 1024 / 1024).toFixed(1)} MB). Recommended sizes are lower for faster loading.`
        : null,
  });
}
