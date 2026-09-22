import { NextResponse } from "next/server";
import { fetchGuestChatConfigServer } from "@/src/lib/guest-chat-server";

/** Public chat widget config (no secrets). */
export async function GET() {
  const config = await fetchGuestChatConfigServer();
  return NextResponse.json(
    { config },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}
