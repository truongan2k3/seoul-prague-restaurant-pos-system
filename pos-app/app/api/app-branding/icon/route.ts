import { createElement } from "react";
import { ImageResponse } from "next/og";
import { isBusinessLogoUrl, readPublicAppBranding } from "@/src/lib/app-branding";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const requestedSize = Number(params.get("size"));
  const size = [32, 180, 192, 512].includes(requestedSize) ? requestedSize : 192;
  const business = await readPublicAppBranding(params.get("business"));
  const fallback = () => Response.redirect(new URL(size > 192 ? "/icon-512.png" : "/icon-192.png", request.url), 307);
  if (!business || !isBusinessLogoUrl(business.logoUrl, business.id)) return fallback();

  try {
    // Fetch only uploaded business assets; rasterize JPEG/WebP/SVG logos to PNG.
    const response = await fetch(business.logoUrl, { redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return fallback();
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 8 * 1024 * 1024) return fallback();
    const extension = new URL(business.logoUrl).pathname.split(".").pop()?.toLowerCase();
    const mime = extension === "svg" ? "image/svg+xml" : extension === "webp" ? "image/webp"
      : extension === "jpg" || extension === "jpeg" ? "image/jpeg" : "image/png";
    const image = createElement("div", {
      style: { display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", background: "#09090b" },
    }, createElement("img", {
      src: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`,
      width: Math.round(size * 0.7), height: Math.round(size * 0.7),
      style: { objectFit: "contain" },
    }));
    const result = new ImageResponse(image, { width: size, height: size });
    // Buffer rendering here so a corrupt logo can use the default icon too.
    return new Response(await result.arrayBuffer(), {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return fallback();
  }
}
