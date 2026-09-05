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

/**
 * Confirm a menu PDF after direct-to-storage upload (avoids HTTP 413).
 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.admin) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }
  const admin = auth.admin;

  let body: {
    language?: string;
    publicUrl?: string;
    storagePath?: string;
    pageCount?: number | null;
    fileSize?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      {
        error:
          "Send JSON metadata after direct storage upload. Do not POST the PDF through this API.",
      },
      { status: 400 },
    );
  }

  const language = String(body.language ?? "").trim() as MenuPdfLanguage;
  const publicUrl = String(body.publicUrl ?? "").trim();
  const storagePath = String(body.storagePath ?? "").trim();
  const fileSize = Number(body.fileSize ?? 0);
  const pageCount =
    body.pageCount != null && Number.isFinite(Number(body.pageCount))
      ? Number(body.pageCount)
      : null;

  if (!ALLOWED.includes(language)) {
    return NextResponse.json({ error: "Invalid language. Use cs, en, or zh." }, { status: 400 });
  }
  if (!publicUrl || !storagePath) {
    return NextResponse.json({ error: "Missing publicUrl or storagePath." }, { status: 400 });
  }
  if (!storagePath.startsWith("menu-pdfs/")) {
    return NextResponse.json({ error: "storagePath must be under menu-pdfs/." }, { status: 400 });
  }

  const label = MENU_PDF_LANGUAGES.find((row) => row.code === language)?.label ?? language;

  const { data, error: dbError } = await admin
    .from("website_menu_pdfs")
    .upsert(
      {
        language,
        label,
        file_url: publicUrl,
        storage_path: storagePath,
        page_count: pageCount,
        file_size: fileSize || null,
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
      fileSize > MAX_BYTES
        ? `Recommended PDF size is up to 25 MB. Your file is ${(fileSize / 1024 / 1024).toFixed(1)} MB.`
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
