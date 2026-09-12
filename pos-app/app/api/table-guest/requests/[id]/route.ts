import { NextResponse } from "next/server";
import { completeTableGuestRequest } from "@/src/lib/table-guest-server";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing request id." }, { status: 400 });
  }

  let body: { completedBy?: string; status?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (body.status && body.status !== "completed") {
    return NextResponse.json({ error: "Only status=completed is supported." }, { status: 400 });
  }

  try {
    const result = await completeTableGuestRequest({
      requestId: id.trim(),
      completedBy: body.completedBy,
    });
    if (result.error || !result.data) {
      return NextResponse.json({ error: result.error ?? "Failed." }, { status: 400 });
    }
    return NextResponse.json({ request: result.data });
  } catch (error) {
    console.error("[table-guest] complete failed", error);
    return NextResponse.json({ error: "Failed to complete request." }, { status: 500 });
  }
}
