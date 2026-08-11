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
    const socket = net.connect({ host, port, timeout: 8000 }, () => {
      socket.write(data, (err) => {
        if (err) {
          socket.destroy();
          reject(err);
          return;
        }
        socket.end();
        resolve();
      });
    });
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`Timeout connecting to ${host}:${port}`));
    });
    socket.on("error", reject);
  });
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
      await tcpSend(host, port, data);
      console.log(
        `[print-bridge] sent ${data.length} bytes → ${payload.printerName || host}:${port}`,
      );
      sendJson(res, 200, {
        ok: true,
        bytes: data.length,
        printer: payload.printerName || `${host}:${port}`,
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
