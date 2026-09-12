import { NextResponse } from "next/server";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import type { BanchanOption } from "@/lib/table-guest";
import {
  loadBanchanAdminPayload,
  saveBanchanAdminPayload,
} from "@/src/lib/table-guest-server";

/** POS Dynamic QR — Banchan catalog + enable flags for editing. */
export async function GET() {
  const staff = await readStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await loadBanchanAdminPayload();
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[table-guest] banchan admin load failed", error);
    return NextResponse.json({ error: "Failed to load banchan options." }, { status: 500 });
  }
}

/** Save Banchan labels (option group) + which ones show on table QR. */
export async function PUT(request: Request) {
  const staff = await readStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    options?: Array<{ id?: string; labelEn?: string; labelCs?: string }>;
    enabledIds?: string[] | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const options: BanchanOption[] = Array.isArray(body.options)
    ? body.options.map((option, index) => ({
        id: String(option.id ?? "").trim() || `banchan-${index}`,
        labelEn: String(option.labelEn ?? "").trim(),
        labelCs: String(option.labelCs ?? option.labelEn ?? "").trim(),
      }))
    : [];

  const enabledIds =
    body.enabledIds === null
      ? null
      : Array.isArray(body.enabledIds)
        ? body.enabledIds.map((id) => String(id).trim()).filter(Boolean)
        : null;

  const result = await saveBanchanAdminPayload({ options, enabledIds });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const payload = await loadBanchanAdminPayload();
  return NextResponse.json({ ok: true, ...payload });
}
