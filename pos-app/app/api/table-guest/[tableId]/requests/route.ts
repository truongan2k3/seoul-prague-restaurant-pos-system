import { NextResponse } from "next/server";
import type { TableGuestRequestKind, TableGuestRequestPayload } from "@/lib/table-guest";
import { createTableGuestRequest } from "@/src/lib/table-guest-server";

type Params = { params: Promise<{ tableId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { tableId } = await params;
  if (!tableId?.trim()) {
    return NextResponse.json({ error: "Missing table id." }, { status: 400 });
  }

  let body: {
    kind?: TableGuestRequestKind;
    payload?: TableGuestRequestPayload;
    note?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.kind) {
    return NextResponse.json({ error: "Missing request kind." }, { status: 400 });
  }

  try {
    const result = await createTableGuestRequest({
      tableId: tableId.trim(),
      kind: body.kind,
      payload: body.payload,
      note: body.note,
    });
    if (result.error || !result.data) {
      return NextResponse.json({ error: result.error ?? "Failed." }, { status: 400 });
    }
    return NextResponse.json({ request: result.data });
  } catch (error) {
    console.error("[table-guest] POST request failed", error);
    return NextResponse.json({ error: "Failed to create request." }, { status: 500 });
  }
}
