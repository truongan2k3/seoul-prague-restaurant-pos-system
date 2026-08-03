import net from "node:net";
import {
  parseBProtocolMessages,
  type BProtocolMessage,
} from "@/src/lib/b-protocol";

interface TerminalInboundState {
  server: net.Server | null;
  listenPort: number | null;
  socket: net.Socket | null;
  remoteAddress: string | null;
  buffer: Buffer;
  waiters: Array<{
    resolve: (socket: net.Socket) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }>;
}

const globalForTerminal = globalThis as typeof globalThis & {
  __terminalInbound?: TerminalInboundState;
};

function getState(): TerminalInboundState {
  if (!globalForTerminal.__terminalInbound) {
    globalForTerminal.__terminalInbound = {
      server: null,
      listenPort: null,
      socket: null,
      remoteAddress: null,
      buffer: Buffer.alloc(0),
      waiters: [],
    };
  }
  return globalForTerminal.__terminalInbound;
}

function attachSocketHandlers(state: TerminalInboundState, socket: net.Socket) {
  state.socket = socket;
  state.remoteAddress = `${socket.remoteAddress ?? "?"}:${socket.remotePort ?? "?"}`;
  state.buffer = Buffer.alloc(0);

  socket.on("data", (chunk) => {
    state.buffer = Buffer.concat([state.buffer, chunk]);
  });

  socket.on("close", () => {
    if (state.socket === socket) {
      state.socket = null;
      state.remoteAddress = null;
      state.buffer = Buffer.alloc(0);
    }
  });

  socket.on("error", () => {
    if (state.socket === socket) {
      state.socket = null;
      state.remoteAddress = null;
      state.buffer = Buffer.alloc(0);
    }
  });
}

export function startInboundTerminalServer(port: number): void {
  const state = getState();
  if (state.server && state.listenPort === port) return;

  if (state.server) {
    state.server.close();
    state.server = null;
  }

  const server = net.createServer((socket) => {
    attachSocketHandlers(state, socket);
    for (const waiter of state.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.resolve(socket);
    }
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.warn(`[terminal] Port ${port} already in use — assuming listener is running.`);
      return;
    }
    console.error("[terminal] Inbound server error:", error.message);
  });

  server.listen(port, "0.0.0.0", () => {
    console.info(`[terminal] Listening for Ingenico/ČSOB terminal on 0.0.0.0:${port}`);
  });

  state.server = server;
  state.listenPort = port;
}

export function getInboundTerminalStatus(): {
  listening: boolean;
  listenPort: number | null;
  connected: boolean;
  remoteAddress: string | null;
} {
  const state = getState();
  return {
    listening: Boolean(state.server?.listening),
    listenPort: state.listenPort,
    connected: Boolean(state.socket && !state.socket.destroyed),
    remoteAddress: state.remoteAddress,
  };
}

function waitForTerminalSocket(timeoutMs: number): Promise<net.Socket> {
  const state = getState();
  if (state.socket && !state.socket.destroyed) {
    return Promise.resolve(state.socket);
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      state.waiters = state.waiters.filter((waiter) => waiter.timer !== timer);
      reject(
        new Error(
          "Terminal chưa kết nối tới POS. Cấu hình terminal: IP PC = 192.168.1.43, port = 2000. Đợi ~15 giây rồi thử lại.",
        ),
      );
    }, timeoutMs);

    state.waiters.push({ resolve, reject, timer });
  });
}

function readFromBuffer(
  state: TerminalInboundState,
  timeoutMs: number,
  isFinal: (messages: BProtocolMessage[]) => boolean,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const started = Date.now();

    const tick = () => {
      const messages = parseBProtocolMessages(state.buffer);
      if (isFinal(messages)) {
        const snapshot = state.buffer;
        state.buffer = Buffer.alloc(0);
        resolve(snapshot);
        return;
      }

      if (Date.now() - started >= timeoutMs) {
        if (state.buffer.length > 0) {
          resolve(state.buffer);
          state.buffer = Buffer.alloc(0);
          return;
        }
        reject(new Error("Terminal response timed out"));
        return;
      }

      setTimeout(tick, 120);
    };

    tick();
  });
}

export async function sendInboundBProtocol(
  listenPort: number,
  request: Buffer,
  timeoutMs: number,
  isFinal: (messages: BProtocolMessage[]) => boolean,
): Promise<Buffer> {
  startInboundTerminalServer(listenPort);
  const state = getState();
  const socket = await waitForTerminalSocket(Math.min(timeoutMs, 20000));

  state.buffer = Buffer.alloc(0);

  await new Promise<void>((resolve, reject) => {
    socket.write(request, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  return readFromBuffer(state, timeoutMs, isFinal);
}
