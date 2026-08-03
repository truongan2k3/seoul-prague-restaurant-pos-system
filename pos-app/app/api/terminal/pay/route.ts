import { NextResponse } from "next/server";
import type { TerminalConnectionMode } from "@/lib/types";
import { tcpSalePayment } from "@/src/lib/terminal-tcp-client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      amount?: number;
      currency?: string;
      terminalIp?: string;
      terminalPort?: string;
      terminalPosId?: string;
      terminalConnectionMode?: TerminalConnectionMode;
      posId?: string;
      terminalId?: string;
    };

    const host = body.terminalIp?.trim() ?? "0.0.0.0";
    const port = Number(body.terminalPort);
    const terminalId = (body.terminalPosId ?? body.posId ?? body.terminalId)?.trim();
    const connectionMode = body.terminalConnectionMode === "outbound" ? "outbound" : "inbound";
    const amount = Number(body.amount);

    if (!Number.isFinite(port) || port <= 0) {
      return NextResponse.json(
        { status: "DECLINED", message: "Terminal IP and port are required." },
        { status: 400 },
      );
    }

    if (!terminalId) {
      return NextResponse.json(
        { status: "DECLINED", message: "Terminal / POS ID is required." },
        { status: 400 },
      );
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { status: "DECLINED", message: "Invalid payment amount." },
        { status: 400 },
      );
    }

    if (body.currency && body.currency !== "CZK") {
      return NextResponse.json(
        { status: "DECLINED", message: "Only CZK is supported." },
        { status: 400 },
      );
    }

    const result = await tcpSalePayment({ host, port, terminalId, connectionMode }, amount);
    return NextResponse.json(result, { status: result.status === "APPROVED" ? 200 : 402 });
  } catch (error) {
    return NextResponse.json(
      {
        status: "DECLINED",
        message: error instanceof Error ? error.message : "Terminal payment failed.",
      },
      { status: 502 },
    );
  }
}
