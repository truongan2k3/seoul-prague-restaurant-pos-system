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

/**
 * Confirm a media slot after the browser uploaded directly to Supabase Storage.
 * Body is small JSON only — avoids Vercel/Next HTTP 413.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.admin) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }
  const admin = auth.admin;

  let body: {
    slot?: string;
    altText?: string;
    publicUrl?: string;
    storagePath?: string;
    mimeType?: string;
    fileSize?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      {
        error:
          "Send JSON metadata after direct storage upload (signed-upload). Do not POST the file through this API.",
      },
      { status: 400 },
    );
  }

  const slot = String(body.slot ?? "").trim() as WebsiteMediaSlot;
  const altText = String(body.altText ?? "").trim();
  const publicUrl = String(body.publicUrl ?? "").trim();
  const storagePath = String(body.storagePath ?? "").trim();
  const mimeType = String(body.mimeType ?? "").trim() || null;
  const fileSize = Number(body.fileSize ?? 0);

  if (!SLOTS.includes(slot)) {
    return NextResponse.json({ error: "Invalid media slot." }, { status: 400 });
  }
  if (!publicUrl || !storagePath) {
    return NextResponse.json({ error: "Missing publicUrl or storagePath." }, { status: 400 });
  }
  if (!storagePath.startsWith(`${slot}/`)) {
    return NextResponse.json({ error: "storagePath does not match slot." }, { status: 400 });
  }

  const { data, error: dbError } = await admin
    .from("website_media_assets")
    .upsert(
      {
        slot,
        file_url: publicUrl,
        storage_path: storagePath,
        mime_type: mimeType,
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
      fileSize > 50 * 1024 * 1024
        ? `Large file (${(fileSize / 1024 / 1024).toFixed(1)} MB). Recommended sizes are lower for faster loading.`
        : null,
  });
}
