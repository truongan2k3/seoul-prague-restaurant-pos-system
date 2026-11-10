import "server-only";
import { request } from "node:https";
import { EET_ENDPOINTS, assertProductionAllowed } from "./policy";
import type { EetEnvironment } from "./types";

export interface TransportResponse { xml: string; httpStatus: number; trace: string | null }

/** HTTP/1.1, TLS >=1.2; certificate auth is SOAP WS-Security, not mutual TLS (v4 spec §2.3, §5). */
export async function postEet(environment: EetEnvironment, xml: string, soapAction: string, timeoutMs = 4_000): Promise<TransportResponse> {
  assertProductionAllowed(environment);
  return new Promise((resolve, reject) => {
    const req = request(EET_ENDPOINTS[environment], {
      method: "POST", minVersion: "TLSv1.2", rejectUnauthorized: true, agent: false,
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${soapAction}"`, "Content-Length": Buffer.byteLength(xml) },
    }, res => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 64 * 1024) { req.destroy(new Error("EET_RESPONSE_TOO_LARGE")); return; }
        chunks.push(chunk);
      });
      res.on("error", () => req.destroy(new Error("EET_RESPONSE_INTERRUPTED")));
      res.on("end", () => {
        clearTimeout(deadline);
        const trace = res.headers["x-global-transaction-id"];
        resolve({ xml: Buffer.concat(chunks).toString("utf8"), httpStatus: res.statusCode ?? 0, trace: typeof trace === "string" ? trace.slice(0, 64) : null });
      });
    });
    const deadline = setTimeout(() => req.destroy(new Error("EET_TIMEOUT")), Math.max(2_000, Math.min(timeoutMs, 10_000)));
    req.on("error", () => { clearTimeout(deadline); reject(new Error("EET network result is uncertain; the immutable transaction will be reconciled.")); });
    req.end(xml);
  });
}
