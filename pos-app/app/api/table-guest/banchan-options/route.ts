import { NextResponse } from "next/server";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { loadAllBanchanCatalogOptions } from "@/src/lib/table-guest-server";

/** POS Dynamic QR — list Banchan catalog options for enable/disable toggles. */
export async function GET() {
  const staff = await readStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const options = await loadAllBanchanCatalogOptions();
    return NextResponse.json({ options });
  } catch (error) {
    console.error("[table-guest] banchan catalog failed", error);
    return NextResponse.json({ error: "Failed to load banchan options." }, { status: 500 });
  }
}
