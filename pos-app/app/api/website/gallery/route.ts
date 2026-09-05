import { NextResponse } from "next/server";
import { canManageStaff, normalizeStaffRole } from "@/lib/staff-roles";
import { nextWebsiteSortOrder } from "@/lib/website/sort-order";
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

/**
 * Confirm a gallery item after direct-to-storage upload (avoids HTTP 413).
 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.admin) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }
  const admin = auth.admin;

  let body: {
    title?: string;
    category?: string;
    publicUrl?: string;
    storagePath?: string;
    mimeType?: string;
    fileSize?: number;
    fileName?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      {
        error:
          "Send JSON metadata after direct storage upload. Do not POST the image through this API.",
      },
      { status: 400 },
    );
  }

  const title = String(body.title ?? "").trim();
  const categoryRaw = String(body.category ?? "food").trim() as GalleryCategory;
  const category = CATEGORIES.includes(categoryRaw) ? categoryRaw : "food";
  const publicUrl = String(body.publicUrl ?? "").trim();
  const storagePath = String(body.storagePath ?? "").trim();
  const mimeType = String(body.mimeType ?? "").trim();
  const fileSize = Number(body.fileSize ?? 0);
  const fileName = String(body.fileName ?? "").trim();

  if (!publicUrl || !storagePath) {
    return NextResponse.json({ error: "Missing publicUrl or storagePath." }, { status: 400 });
  }
  if (!storagePath.startsWith("gallery/")) {
    return NextResponse.json({ error: "storagePath must be under gallery/." }, { status: 400 });
  }
  if (mimeType && !mimeType.startsWith("image/")) {
    return NextResponse.json({ error: "Gallery accepts images only." }, { status: 400 });
  }

  const { data, error: dbError } = await admin
    .from("website_gallery_items")
    .insert({
      category,
      title: title || fileName.replace(/\.[^.]+$/, "") || "Gallery image",
      image_url: publicUrl,
      storage_path: storagePath,
      sort_order: nextWebsiteSortOrder(),
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
      fileSize > 20 * 1024 * 1024
        ? `Large image (${(fileSize / 1024 / 1024).toFixed(1)} MB). Consider compressing for faster loading.`
        : null,
  });
}
