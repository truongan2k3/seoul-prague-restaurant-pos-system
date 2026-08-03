import { NextResponse } from "next/server";
import type { TerminalConnectionMode } from "@/lib/types";
import { tcpHandshake } from "@/src/lib/terminal-tcp-client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      terminalIp?: string;
      terminalPort?: string;
      terminalPosId?: string;
      terminalConnectionMode?: TerminalConnectionMode;
    };

    const host = body.terminalIp?.trim() ?? "0.0.0.0";
    const port = Number(body.terminalPort);
    const terminalId = body.terminalPosId?.trim();
    const connectionMode = body.terminalConnectionMode === "outbound" ? "outbound" : "inbound";

    if (!Number.isFinite(port) || port <= 0) {
      return NextResponse.json(
        { ok: false, message: "Terminal IP and port are required." },
        { status: 400 },
      );
    }

    if (!terminalId) {
      return NextResponse.json(
        { ok: false, message: "Terminal / POS ID is required." },
        { status: 400 },
      );
    }

    const result = await tcpHandshake({ host, port, terminalId, connectionMode });
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Terminal health check failed.",
      },
      { status: 500 },
    );
  }
}
