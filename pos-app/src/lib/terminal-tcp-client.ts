import net from "node:net";
import {
  buildAckMessage,
  buildHandshakeMessage,
  buildSaleMessage,
  extractLast4FromPan,
  isApprovedResponse,
  isBusyResponse,
  needsExplicitAck,
  parseBProtocolMessages,
  type BProtocolMessage,
} from "@/src/lib/b-protocol";
import type { TerminalPaymentResponse } from "@/src/lib/terminalApi";
import type { TerminalConnectionMode } from "@/lib/types";
import {
  getInboundTerminalStatus,
  sendInboundBProtocol,
  startInboundTerminalServer,
} from "@/src/lib/terminal-connection-manager";

export interface TerminalTcpConfig {
  host: string;
  port: number;
  terminalId: string;
  connectionMode?: TerminalConnectionMode;
  connectTimeoutMs?: number;
  paymentTimeoutMs?: number;
}

function connectTcp(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      if (error) {
        socket.destroy();
        reject(error);
      }
    };

    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => finish(new Error("TCP connection timed out")));
    socket.once("error", (error) => finish(error));
    socket.connect(port, host, () => {
      if (settled) return;
      settled = true;
      socket.setTimeout(0);
      resolve(socket);
    });
  });
}

function readUntilFinalResponse(
  socket: net.Socket,
  timeoutMs: number,
  isFinal: (messages: BProtocolMessage[]) => boolean,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let timer: NodeJS.Timeout | null = null;

    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
      if (timer) clearTimeout(timer);
    };

    const evaluate = () => {
      const combined = Buffer.concat(chunks);
      const messages = parseBProtocolMessages(combined);
      if (isFinal(messages)) {
        cleanup();
        resolve(combined);
      }
    };

    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
      evaluate();
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onClose = () => {
      cleanup();
      if (chunks.length > 0) {
        resolve(Buffer.concat(chunks));
        return;
      }
      reject(new Error("Terminal closed the connection"));
    };

    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("close", onClose);
    timer = setTimeout(() => {
      cleanup();
      if (chunks.length > 0) {
        resolve(Buffer.concat(chunks));
        return;
      }
      reject(new Error("Terminal response timed out"));
    }, timeoutMs);
  });
}

async function exchangeUntilFinal(
  config: TerminalTcpConfig,
  request: Buffer,
  timeoutMs: number,
  isFinal: (messages: BProtocolMessage[]) => boolean,
): Promise<Buffer> {
  const socket = await connectTcp(
    config.host,
    config.port,
    config.connectTimeoutMs ?? 8000,
  );

  try {
    await new Promise<void>((resolve, reject) => {
      socket.write(request, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    return await readUntilFinalResponse(socket, timeoutMs, isFinal);
  } finally {
    socket.end();
    socket.destroy();
  }
}

function isFinalHandshakeOrSale(messages: BProtocolMessage[]): boolean {
  return messages.some(
    (message) =>
      message.protocolType === "B2" ||
      message.fields.T === "95" ||
      (message.protocolType === "B2" && message.fields.T === "00"),
  );
}

async function exchangeBProtocol(
  config: TerminalTcpConfig,
  request: Buffer,
  timeoutMs: number,
  isFinal: (messages: BProtocolMessage[]) => boolean,
): Promise<Buffer> {
  if (config.connectionMode === "inbound") {
    return sendInboundBProtocol(config.port, request, timeoutMs, isFinal);
  }

  return exchangeUntilFinal(config, request, timeoutMs, isFinal);
}

function exchange(
  config: TerminalTcpConfig,
  request: Buffer,
  timeoutMs: number,
): Promise<Buffer> {
  return exchangeBProtocol(
    config,
    request,
    timeoutMs,
    (messages) => messages.some((message) => message.protocolType === "B2" || message.fields.T === "95"),
  );
}

function findFinalSaleResponse(messages: BProtocolMessage[]): BProtocolMessage | undefined {
  return [...messages].reverse().find((message) => message.protocolType === "B2" && message.fields.T === "00");
}

export async function tcpHandshake(config: TerminalTcpConfig): Promise<{ ok: boolean; message: string }> {
  try {
    if (config.connectionMode === "inbound") {
      startInboundTerminalServer(config.port);
      const status = getInboundTerminalStatus();
      if (!status.connected) {
        return {
          ok: false,
          message: `POS đang lắng nghe port ${config.port}. Terminal chưa kết nối — cấu hình terminal: IP PC 192.168.1.43, port ${config.port}, POS ID ${config.terminalId.trim()}. Đợi ~15s rồi Test lại.`,
        };
      }
    }

    const responseBuffer = await exchange(config, buildHandshakeMessage(config.terminalId), 15000);
    const messages = parseBProtocolMessages(responseBuffer);
    const handshake = messages.find((message) => message.fields.T === "95");

    if (!handshake) {
      return { ok: false, message: "Terminal connected but handshake response was unexpected." };
    }

    if (isApprovedResponse(handshake)) {
      const info = handshake.fields.g ?? "APPROVED";
      const endpoint =
        config.connectionMode === "inbound"
          ? `inbound :${config.port} ← ${getInboundTerminalStatus().remoteAddress ?? "terminal"}`
          : `${config.host}:${config.port}`;
      return {
        ok: true,
        message: `Handshake OK (${endpoint}, ${config.terminalId.trim()}) — ${info}`,
      };
    }

    return {
      ok: false,
      message: handshake.fields.g ?? `Handshake failed (R=${handshake.fields.R ?? "?"})`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to connect to terminal.";
    if (message.includes("ECONNREFUSED") && config.connectionMode !== "inbound") {
      return {
        ok: false,
        message:
          `ECONNREFUSED ${config.host}:${config.port} — terminal không lắng nghe port này. Thử chế độ Inbound: POS lắng nghe port ${config.port}, terminal kết nối tới IP PC 192.168.1.43.`,
      };
    }
    return { ok: false, message };
  }
}

export async function tcpSalePayment(
  config: TerminalTcpConfig,
  amountCzk: number,
): Promise<TerminalPaymentResponse> {
  const paymentTimeout = config.paymentTimeoutMs ?? 120_000;
  let responseBuffer = await exchangeBProtocol(
    config,
    buildSaleMessage(config.terminalId, amountCzk),
    paymentTimeout,
    (messages) => findFinalSaleResponse(messages) !== undefined || messages.some(isBusyResponse),
  );

  let messages = parseBProtocolMessages(responseBuffer);
  let finalResponse = findFinalSaleResponse(messages);

  if (!finalResponse) {
    const busy = messages.find(isBusyResponse);
    if (busy) {
      throw new Error(busy.fields.g ?? "Terminal is busy — finish or cancel the current operation on the device.");
    }
    throw new Error("No payment response received from terminal.");
  }

  if (needsExplicitAck(finalResponse)) {
    responseBuffer = await exchangeBProtocol(config, buildAckMessage(config.terminalId), 10000, isFinalHandshakeOrSale);
    messages = parseBProtocolMessages(responseBuffer);
    finalResponse = findFinalSaleResponse(messages) ?? finalResponse;
  }

  if (isApprovedResponse(finalResponse)) {
    return {
      status: "APPROVED",
      authCode: finalResponse.fields.F?.trim(),
      last4: extractLast4FromPan(finalResponse.fields.P),
      brand: finalResponse.fields.J?.trim(),
      message: finalResponse.fields.g?.trim(),
    };
  }

  return {
    status: "DECLINED",
    authCode: finalResponse.fields.F?.trim(),
    last4: extractLast4FromPan(finalResponse.fields.P),
    brand: finalResponse.fields.J?.trim(),
    message: finalResponse.fields.g?.trim() ?? `Declined (R=${finalResponse.fields.R ?? "?"})`,
  };
}
