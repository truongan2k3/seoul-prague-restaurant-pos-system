#!/usr/bin/env node
/**
 * Standalone print bridge — copy ONLY this folder to the restaurant Windows PC.
 * No pos-app / Next.js project needed.
 *
 * Double-click: start-bridge.bat
 * Or:          node server.mjs
 */

import http from "node:http";
import net from "node:net";
import os from "node:os";

const PORT = Number(process.env.PRINT_BRIDGE_PORT || 39100);
/** Listen on all interfaces so phones/tablets on the same Wi‑Fi can reach this PC. */
const HOST = process.env.PRINT_BRIDGE_HOST || "0.0.0.0";

function lanIPv4Addresses() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const entry of list) {
      if (entry.family === "IPv4" && !entry.internal) {
        out.push(entry.address);
      }
    }
  }
  return out;
}

/** CORS + Chrome Private Network Access (HTTPS Vercel → http://127.0.0.1). */
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Private-Network": "true",
  };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  const headers = {
    ...corsHeaders(),
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  };
  res.writeHead(status, headers);
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function tcpSend(host, port, data) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve();
    };
    const socket = net.connect({ host, port, timeout: 4500 }, () => {
      socket.write(data, (err) => {
        if (err) {
          socket.destroy();
          done(err);
          return;
        }
        socket.end(() => done());
      });
    });
    socket.on("timeout", () => {
      socket.destroy();
      done(new Error(`Timeout connecting to ${host}:${port} (printer offline or IP changed)`));
    });
    socket.on("error", (err) => {
      socket.destroy();
      done(new Error(`Cannot reach ${host}:${port}: ${err.message}`));
    });
  });
}

function probePort(host, port, timeoutMs = 450) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let finished = false;
    const finish = (ok) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve(ok ? { host, port, latencyMs: Date.now() - start } : null);
    };
    socket.setTimeout(timeoutMs);
    socket.connect(port, host, () => finish(true));
    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));
  });
}

async function scanLanPrinters(port = 9100) {
  const prefixes = new Set();
  for (const ip of lanIPv4Addresses()) {
    const parts = ip.split(".");
    if (parts.length === 4) prefixes.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
  }
  const candidates = [];
  for (const prefix of prefixes) {
    for (let i = 1; i <= 254; i++) {
      candidates.push(`${prefix}.${i}`);
    }
  }
  const found = [];
  const BATCH = 48;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((host) => probePort(host, port)));
    for (const item of results) {
      if (item) found.push(item);
    }
  }
  return found;
}

const recentPrints = new Map();

function isDuplicatePrint(host, port, byteCount, dataBase64) {
  const sample = dataBase64.length > 120 ? dataBase64.slice(-120) : dataBase64;
  const key = `${host}:${port}:${byteCount}:${sample}`;
  const now = Date.now();

  for (const [k, ts] of recentPrints.entries()) {
    if (now - ts > 30000) recentPrints.delete(k);
  }

  if (recentPrints.has(key)) {
    const elapsed = now - recentPrints.get(key);
    if (elapsed < 10000) return true;
  }
  recentPrints.set(key, now);
  return false;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      service: "pos-print-bridge",
      port: PORT,
      lanIps: lanIPv4Addresses(),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/ping-printer") {
    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw.toString("utf8"));
      const host = String(payload.host || "").trim();
      const port = Number(payload.port) || 9100;
      if (!host) {
        sendJson(res, 400, { ok: false, error: "host required" });
        return;
      }
      const pingStart = Date.now();
      const socket = new net.Socket();
      socket.setTimeout(3000);

      socket.connect(port, host, () => {
        const latencyMs = Date.now() - pingStart;
        socket.destroy();
        console.log(`[print-bridge] ping ${host}:${port} -> OK (${latencyMs}ms)`);
        sendJson(res, 200, { ok: true, latencyMs });
      });

      socket.on("timeout", () => {
        socket.destroy();
        console.log(`[print-bridge] ping ${host}:${port} -> FAIL: Timeout`);
        sendJson(res, 200, { ok: false, error: "Timeout connecting to printer" });
      });

      socket.on("error", (err) => {
        socket.destroy();
        console.log(`[print-bridge] ping ${host}:${port} -> FAIL: ${err.message}`);
        sendJson(res, 200, { ok: false, error: err.message });
      });
    } catch (e) {
      sendJson(res, 400, { ok: false, error: e.message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/scan-printers") {
    try {
      const raw = await readBody(req).catch(() => Buffer.alloc(0));
      let port = 9100;
      if (raw.length > 0) {
        const parsed = JSON.parse(raw.toString("utf8"));
        if (Number(parsed?.port) > 0) port = Number(parsed.port);
      }
      const found = await scanLanPrinters(port);
      console.log(`[print-bridge] LAN scan port ${port}: found ${found.length} printer(s)`);
      sendJson(res, 200, { ok: true, port, found });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message, found: [] });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/print") {
    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw.toString("utf8"));
      const host = String(payload.host || "").trim();
      const port = Number(payload.port) || 9100;
      const dataBase64 = String(payload.dataBase64 || "");
      if (!host || !dataBase64) {
        sendJson(res, 400, { ok: false, error: "host and dataBase64 required" });
        return;
      }
      const data = Buffer.from(dataBase64, "base64");
      const printerName = payload.printerName || `${host}:${port}`;

      if (isDuplicatePrint(host, port, data.length, dataBase64)) {
        console.log(`[print-bridge] duplicate print ignored (${data.length} bytes → ${printerName})`);
        sendJson(res, 200, {
          ok: true,
          bytes: data.length,
          printer: printerName,
          duplicate: true,
        });
        return;
      }

      await tcpSend(host, port, data);
      console.log(
        `[print-bridge] sent ${data.length} bytes → ${printerName}`,
      );
      sendJson(res, 200, {
        ok: true,
        bytes: data.length,
        printer: printerName,
      });
    } catch (error) {
      console.error("[print-bridge] print failed:", error);
      sendJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : "Print failed",
      });
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
});

server.listen(PORT, HOST, () => {
  const ips = lanIPv4Addresses();
  console.log("");
  console.log("========================================");
  console.log("  POS Print Bridge is RUNNING");
  console.log("========================================");
  console.log(`  Local:   http://127.0.0.1:${PORT}`);
  if (ips.length === 0) {
    console.log("  LAN IP:  (not found — check Wi‑Fi)");
  } else {
    for (const ip of ips) {
      console.log(`  LAN:     http://${ip}:${PORT}`);
    }
  }
  console.log("");
  console.log("  Print Station setup:");
  console.log("  1) Keep this window OPEN");
  console.log("  2) On THIS PC open POS → /print-station");
  console.log("  3) Settings → Print bridge URL = http://127.0.0.1:" + PORT);
  console.log("  Printer IP (e.g. 192.168.1.202) goes under Network printers.");
  console.log("========================================");
  console.log("");
});
