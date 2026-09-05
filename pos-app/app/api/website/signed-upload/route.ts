import { NextResponse } from "next/server";
import { canManageStaff, normalizeStaffRole } from "@/lib/staff-roles";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";

export const runtime = "nodejs";

const BUCKET = "restaurant_media";
const FOLDERS = new Set([
  "logo",
  "hero_image",
  "hero_video",
  "about_image",
  "signature_1",
  "signature_2",
  "signature_3",
  "gallery",
  "videos",
  "videos/posters",
  "amenities",
  "menu-pdfs",
  "misc",
]);

/** 200 MB — enough for promo videos; bypasses Next/Vercel body limits via signed PUT. */
const FILE_SIZE_LIMIT = 200 * 1024 * 1024;

function errorMessage(error: unknown): string {
  if (!error) return "Request failed.";
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "upload.bin";
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

/**
 * Returns a Supabase signed upload URL so the browser can PUT the file
 * directly to storage — bypasses Vercel/Next 413 body limits.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.admin) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }
  const admin = auth.admin;

  let body: { folder?: string; fileName?: string; contentType?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const folder = String(body.folder ?? "misc").trim();
  if (!FOLDERS.has(folder)) {
    return NextResponse.json({ error: `Invalid upload folder: ${folder}` }, { status: 400 });
  }

  const fileName = sanitizeFileName(String(body.fileName ?? "upload.bin"));
  const contentType = String(body.contentType ?? "application/octet-stream");
  const path = `${folder}/${Date.now()}-${fileName}`;

  const { data: buckets } = await admin.storage.listBuckets();
  const exists = (buckets ?? []).some((bucket) => bucket.name === BUCKET);
  if (!exists) {
    const { error: createError } = await admin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: FILE_SIZE_LIMIT,
    });
    if (createError && !/already exists|duplicate/i.test(createError.message)) {
      return NextResponse.json(
        { error: `Storage bucket missing: ${createError.message}` },
        { status: 500 },
      );
    }
  } else {
    // Raise limit if an older bucket was created with a small cap (e.g. 25 MB for PDFs).
    await admin.storage.updateBucket(BUCKET, {
      public: true,
      fileSizeLimit: FILE_SIZE_LIMIT,
    });
  }

  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path, {
    upsert: true,
  });
  if (error || !data) {
    return NextResponse.json(
      {
        error: `Could not create signed upload URL: ${error?.message ?? "unknown"}. Ensure SUPABASE_SERVICE_ROLE_KEY is set.`,
      },
      { status: 500 },
    );
  }

  const { data: publicData } = admin.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({
    bucket: BUCKET,
    path: data.path ?? path,
    token: data.token,
    signedUrl: data.signedUrl,
    publicUrl: publicData.publicUrl,
    contentType,
  });
}
