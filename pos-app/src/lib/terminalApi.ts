import type { TerminalConnectionMode, TerminalType } from "@/lib/types";

export type TerminalPaymentStatus = "APPROVED" | "DECLINED";

export interface TerminalPaymentRequest {
  amount: number;
  currency: "CZK";
}

export interface TerminalPaymentResponse {
  status: TerminalPaymentStatus;
  authCode?: string;
  last4?: string;
  brand?: string;
  message?: string;
}

export interface TerminalConfig {
  terminalType: TerminalType;
  terminalIp: string;
  terminalPort: string;
  terminalPosId: string;
  terminalConnectionMode?: TerminalConnectionMode;
  timeoutMs?: number;
}

export class TerminalPaymentCancelledError extends Error {
  constructor() {
    super("Payment cancelled");
    this.name = "TerminalPaymentCancelledError";
  }
}

export class TerminalPaymentDeclinedError extends Error {
  response: TerminalPaymentResponse;

  constructor(response: TerminalPaymentResponse) {
    super(response.message ?? "Card declined");
    this.name = "TerminalPaymentDeclinedError";
    this.response = response;
  }
}

export class TerminalPaymentTimeoutError extends Error {
  constructor() {
    super("Terminal timed out");
    this.name = "TerminalPaymentTimeoutError";
  }
}

const MOCK_DELAY_MS = 3000;
const DEFAULT_TIMEOUT_MS = 60_000;

const MOCK_RESPONSE: TerminalPaymentResponse = {
  status: "APPROVED",
  authCode: "A98765",
  last4: "4321",
  brand: "Mastercard",
};

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new TerminalPaymentCancelledError());
      return;
    }

    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new TerminalPaymentCancelledError());
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function processMockPayment(
  signal?: AbortSignal,
): Promise<TerminalPaymentResponse> {
  await delay(MOCK_DELAY_MS, signal);
  return { ...MOCK_RESPONSE };
}

async function processNetworkPayment(
  request: TerminalPaymentRequest,
  config: TerminalConfig,
  signal?: AbortSignal,
): Promise<TerminalPaymentResponse> {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  const onParentAbort = () => controller.abort();
  signal?.addEventListener("abort", onParentAbort, { once: true });

  const posId = config.terminalPosId.trim();

  try {
    const response = await fetch("/api/terminal/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: request.amount,
        currency: request.currency,
        terminalIp: config.terminalIp.trim(),
        terminalPort: config.terminalPort.trim(),
        terminalPosId: posId,
        terminalConnectionMode: config.terminalConnectionMode ?? "inbound",
        posId,
      }),
      signal: controller.signal,
    });

    const data = (await response.json()) as Partial<TerminalPaymentResponse>;

    if (data.status === "APPROVED") {
      return {
        status: "APPROVED",
        authCode: data.authCode,
        last4: data.last4,
        brand: data.brand,
        message: data.message,
      };
    }

    if (data.status === "DECLINED") {
      throw new TerminalPaymentDeclinedError({
        status: "DECLINED",
        authCode: data.authCode,
        last4: data.last4,
        brand: data.brand,
        message: data.message ?? "Card declined",
      });
    }

    throw new Error(data.message ?? `Terminal HTTP ${response.status}`);
  } catch (error) {
    if (error instanceof TerminalPaymentCancelledError) {
      throw error;
    }
    if (error instanceof TerminalPaymentDeclinedError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      if (signal?.aborted) {
        throw new TerminalPaymentCancelledError();
      }
      throw new TerminalPaymentTimeoutError();
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onParentAbort);
  }
}

export async function processTerminalPayment(
  request: TerminalPaymentRequest,
  config: TerminalConfig,
  signal?: AbortSignal,
): Promise<TerminalPaymentResponse> {
  if (signal?.aborted) {
    throw new TerminalPaymentCancelledError();
  }

  if (config.terminalType === "mock") {
    return processMockPayment(signal);
  }

  return processNetworkPayment(request, config, signal);
}

export async function testTerminalConnection(
  config: TerminalConfig,
): Promise<{ ok: boolean; message: string }> {
  if (config.terminalType === "mock") {
    await delay(800);
    return { ok: true, message: "Mock simulator ready (3s NFC tap delay)." };
  }

  const ip = config.terminalIp.trim();
  const port = config.terminalPort.trim();
  const posId = config.terminalPosId.trim();

  if (!ip || !port) {
    return { ok: false, message: "Terminal IP and port are required." };
  }

  if (!posId) {
    return { ok: false, message: "Terminal / POS ID is required." };
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch("/api/terminal/health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalIp: ip,
        terminalPort: port,
        terminalPosId: posId,
        terminalConnectionMode: config.terminalConnectionMode ?? "inbound",
      }),
      signal: controller.signal,
    });

    const data = (await response.json()) as { ok: boolean; message: string };
    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, message: "Connection timed out. Check IP, port, and network." };
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to reach terminal.",
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}
