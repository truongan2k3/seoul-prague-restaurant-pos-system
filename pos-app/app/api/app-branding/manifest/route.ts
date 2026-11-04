import { buildBrandedManifest } from "@/lib/app-branding";
import { readPublicAppBranding } from "@/src/lib/app-branding";

export async function GET(request: Request) {
  const business = await readPublicAppBranding(new URL(request.url).searchParams.get("business"));
  if (!business) return Response.redirect(new URL("/manifest.json", request.url), 307);
  return Response.json(buildBrandedManifest(business), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=60" },
  });
}
