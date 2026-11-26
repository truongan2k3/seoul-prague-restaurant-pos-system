import { NextResponse } from "next/server";
import { canManageStaff, normalizeStaffRole } from "@/lib/staff-roles";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";

export const runtime = "nodejs";

const BUCKET = "restaurant_media";
const FILE_SIZE_LIMIT = 20 * 1024 * 1024;
const ALLOWED_ROLES = new Set(["front-bg", "back-bg", "logo"]);

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "image.png";
}

export async function POST(request: Request) {
  const staff = await readStaffSession();
  const business = staff ? null : await readAuthSession();
  if (!staff && !business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (staff && !canManageStaff(normalizeStaffRole(staff.staffRole))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  let body: { role?: string; fileName?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const role = ALLOWED_ROLES.has(String(body.role ?? "")) ? String(body.role) : "front-bg";
  const fileName = sanitizeFileName(String(body.fileName ?? "voucher-asset.png"));
  const path = `voucher-design/${role}-${Date.now()}-${fileName}`;

  const admin = createSupabaseAdmin();
  const { data: buckets } = await admin.storage.listBuckets();
  const exists = (buckets ?? []).some((b) => b.name === BUCKET);
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
  }

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(path, { upsert: true });

  if (error || !data) {
    return NextResponse.json(
      { error: `Could not create upload URL: ${error?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  const { data: publicData } = admin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({
    signedUrl: data.signedUrl,
    path: data.path ?? path,
    publicUrl: publicData.publicUrl,
  });
}
