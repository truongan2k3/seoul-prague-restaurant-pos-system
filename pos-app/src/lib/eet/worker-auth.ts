import "server-only";
import { timingSafeEqual } from "node:crypto";

export function isEetWorkerAuthorized(request: Request) {
  const secret = process.env.EET_WORKER_SECRET;
  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  return Boolean(secret && secret.length >= 32 && Buffer.byteLength(provided) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(provided), Buffer.from(expected)));
}
