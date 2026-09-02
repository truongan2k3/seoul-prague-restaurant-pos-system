import { NextResponse } from "next/server";
import { canManageStaff, normalizeStaffRole } from "@/lib/staff-roles";
import { MENU_PDF_LANGUAGES } from "@/lib/website/defaults";
import type { MenuPdfLanguage } from "@/lib/website/types";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";
import { mapMenuPdfRow } from "@/src/lib/website-public";

export const runtime = "nodejs";

const ALLOWED: MenuPdfLanguage[] = ["cs", "en", "zh"];
const MAX_BYTES = 25 * 1024 * 1024;

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

async function ensureRestaurantMediaBucket(
  admin: ReturnType<typeof createSupabaseAdmin>,
): Promise<string | null> {
  const { data: buckets, error: listError } = await admin.storage.listBuckets();
  if (listError) return listError.message;

  const exists = (buckets ?? []).some((bucket) => bucket.name === "restaurant_media");
  if (exists) return null;

  const { error: createError } = await admin.storage.createBucket("restaurant_media", {
    public: true,
    fileSizeLimit: MAX_BYTES,
    allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/svg+xml", "video/mp4", "video/webm"],
  });
  if (createError && !/already exists|duplicate/i.test(createError.message)) {
    return createError.message;
  }
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
  } catch {
    return NextResponse.json(
      { error: "Could not read upload. File may be too large (max 25 MB)." },
      { status: 400 },
    );
  }

  const language = String(form.get("language") ?? "").trim() as MenuPdfLanguage;
  const file = form.get("file");

  if (!ALLOWED.includes(language)) {
    return NextResponse.json({ error: "Invalid language. Use cs, en, or zh." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing PDF file." }, { status: 400 });
  }

  const isPdf =
    file.type === "application/pdf" ||
    file.type === "application/x-pdf" ||
    file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    // Soft recommendation only — continue upload and include a warning.
  }

  const bucketError = await ensureRestaurantMediaBucket(admin);
  if (bucketError) {
    return NextResponse.json(
      {
        error: `Storage bucket missing (${bucketError}). Run supabase/patch-website-cms.sql or create bucket "restaurant_media".`,
      },
      { status: 500 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const path = `menu-pdfs/${language}-${Date.now()}.pdf`;
  const { error: uploadError } = await admin.storage.from("restaurant_media").upload(path, buffer, {
    cacheControl: "31536000",
    upsert: true,
    contentType: "application/pdf",
  });

  if (uploadError) {
    return NextResponse.json(
      {
        error: `Storage upload failed: ${uploadError.message}. Ensure SUPABASE_SERVICE_ROLE_KEY is set and bucket restaurant_media exists.`,
      },
      { status: 500 },
    );
  }

  const { data: publicData } = admin.storage.from("restaurant_media").getPublicUrl(path);
  const label = MENU_PDF_LANGUAGES.find((row) => row.code === language)?.label ?? language;
  const pageCountRaw = form.get("pageCount");
  const pageCount =
    typeof pageCountRaw === "string" && pageCountRaw.trim()
      ? Number(pageCountRaw)
      : null;

  const { data, error: dbError } = await admin
    .from("website_menu_pdfs")
    .upsert(
      {
        language,
        label,
        file_url: publicData.publicUrl,
        storage_path: path,
        page_count: Number.isFinite(pageCount) ? pageCount : null,
        file_size: buffer.length,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "language" },
    )
    .select("*")
    .single();

  if (dbError) {
    const missingTable = /does not exist|42P01|schema cache/i.test(dbError.message);
    return NextResponse.json(
      {
        error: missingTable
          ? "Table website_menu_pdfs is missing. Run supabase/patch-website-menu-pdfs.sql in Supabase SQL editor."
          : `Database save failed: ${dbError.message}`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    data: mapMenuPdfRow(data as Record<string, unknown>),
    warning:
      file.size > MAX_BYTES
        ? `Recommended PDF size is up to 25 MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`
        : null,
  });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.admin) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }

  const language = new URL(request.url).searchParams.get("language") as MenuPdfLanguage | null;
  if (!language || !ALLOWED.includes(language)) {
    return NextResponse.json({ error: "Invalid language." }, { status: 400 });
  }

  const { error } = await auth.admin.from("website_menu_pdfs").delete().eq("language", language);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
