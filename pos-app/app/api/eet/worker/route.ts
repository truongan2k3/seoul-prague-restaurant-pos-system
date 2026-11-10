import { runEetWorker } from "@/src/lib/eet/worker";
import { isEetWorkerAuthorized } from "@/src/lib/eet/worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  if (!isEetWorkerAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try { return Response.json(await runEetWorker(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "EET worker unavailable. Inspect queue health." }, { status: 503 }); }
}
export const POST = GET;
