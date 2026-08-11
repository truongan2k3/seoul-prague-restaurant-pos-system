#!/usr/bin/env node
/**
 * Local silent print bridge for restaurant LAN thermal printers.
 *
 * Run on a PC that can reach the printers (same Wi‑Fi/LAN as Star/Epson :9100):
 *   node print-bridge/server.mjs
 *
 * POS Settings → enable Silent network print → Bridge URL http://127.0.0.1:39100
 */

import http from "node:http";
import net from "node:net";

const PORT = Number(process.env.PRINT_BRIDGE_PORT || 39100);
const HOST = process.env.PRINT_BRIDGE_HOST || "127.0.0.1";

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Length": Buffer.byteLength(body),
  });
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
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { ok: true, service: "pos-print-bridge", port: PORT });
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
      sendJson(res, 200, {
        ok: true,
        bytes: data.length,
        printer: payload.printerName || `${host}:${port}`,
      });
    } catch (error) {
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
  console.log(`[print-bridge] listening on http://${HOST}:${PORT}`);
  console.log(`[print-bridge] health: GET /health  print: POST /print`);
});
