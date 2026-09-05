import { NextResponse } from "next/server";
import { canManageStaff, normalizeStaffRole } from "@/lib/staff-roles";
import { nextWebsiteSortOrder } from "@/lib/website/sort-order";
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

/**
 * Confirm a video row after direct-to-storage upload (avoids HTTP 413).
 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.admin) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }
  const admin = auth.admin;

  let body: {
    title?: string;
    description?: string;
    slot?: string;
    publicUrl?: string;
    storagePath?: string;
    mimeType?: string;
    fileSize?: number;
    posterUrl?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      {
        error:
          "Send JSON metadata after direct storage upload. Do not POST the video through this API.",
      },
      { status: 400 },
    );
  }

  const title = String(body.title ?? "").trim() || "Promo video";
  const description = String(body.description ?? "").trim();
  const slotRaw = String(body.slot ?? "promo").trim() as VideoSlot;
  const slot = SLOTS.includes(slotRaw) ? slotRaw : "promo";
  const publicUrl = String(body.publicUrl ?? "").trim();
  const storagePath = String(body.storagePath ?? "").trim();
  const mimeType = String(body.mimeType ?? "").trim();
  const fileSize = Number(body.fileSize ?? 0);
  const posterUrl = String(body.posterUrl ?? "").trim();

  if (!publicUrl || !storagePath) {
    return NextResponse.json({ error: "Missing publicUrl or storagePath." }, { status: 400 });
  }
  if (!storagePath.startsWith("videos/")) {
    return NextResponse.json({ error: "storagePath must be under videos/." }, { status: 400 });
  }
  if (mimeType && !mimeType.startsWith("video/")) {
    return NextResponse.json({ error: "File must be a video (MP4 / WebM)." }, { status: 400 });
  }

  const { data, error: dbError } = await admin
    .from("website_videos")
    .insert({
      title,
      description,
      video_url: publicUrl,
      poster_url: posterUrl || null,
      slot,
      sort_order: nextWebsiteSortOrder(),
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
      fileSize > 80 * 1024 * 1024
        ? `Large video (${(fileSize / 1024 / 1024).toFixed(1)} MB). Compress for faster page loads.`
        : null,
  });
}
