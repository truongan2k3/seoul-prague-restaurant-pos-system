import { NextResponse } from "next/server";
import { loadTableGuestSnapshot } from "@/src/lib/table-guest-server";

type Params = { params: Promise<{ tableId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { tableId } = await params;
  if (!tableId?.trim()) {
    return NextResponse.json({ error: "Missing table id." }, { status: 400 });
  }

  try {
    const snapshot = await loadTableGuestSnapshot(tableId.trim());
    if (!snapshot) {
      return NextResponse.json({ error: "Table not found." }, { status: 404 });
    }
    return NextResponse.json({ table: snapshot });
  } catch (error) {
    console.error("[table-guest] GET failed", error);
    return NextResponse.json({ error: "Failed to load table." }, { status: 500 });
  }
}
