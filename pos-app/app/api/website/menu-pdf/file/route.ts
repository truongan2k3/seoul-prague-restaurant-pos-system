import { NextResponse } from "next/server";
import type { MenuPdfLanguage } from "@/lib/website/types";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED: MenuPdfLanguage[] = ["cs", "en", "zh"];

/** Proxy PDF bytes so the browser flipbook is not blocked by storage CORS. */
export async function GET(request: Request) {
  const language = new URL(request.url).searchParams.get("language") as MenuPdfLanguage | null;
  if (!language || !ALLOWED.includes(language)) {
    return NextResponse.json({ error: "Invalid language." }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("website_menu_pdfs")
      .select("file_url, storage_path, label")
      .eq("language", language)
      .maybeSingle();

    if (error || !data?.file_url) {
      return NextResponse.json({ error: "Menu PDF not found." }, { status: 404 });
    }

    let bytes: ArrayBuffer | null = null;

    if (data.storage_path) {
      const downloaded = await admin.storage.from("restaurant_media").download(data.storage_path);
      if (!downloaded.error && downloaded.data) {
        bytes = await downloaded.data.arrayBuffer();
      }
    }

    if (!bytes) {
      const response = await fetch(data.file_url, { cache: "no-store" });
      if (!response.ok) {
        return NextResponse.json({ error: "Could not fetch PDF file." }, { status: 502 });
      }
      bytes = await response.arrayBuffer();
    }

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="menu-${language}.pdf"`,
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load PDF." },
      { status: 500 },
    );
  }
}
