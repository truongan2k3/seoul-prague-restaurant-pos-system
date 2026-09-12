import { NextResponse, type NextRequest } from "next/server";
import { decodeAuthSession } from "@/src/lib/auth/session-token";
import { decodeStaffSession, STAFF_COOKIE_NAME } from "@/src/lib/auth/staff-session-token";
import { isStationPath } from "@/lib/page-routes";

const PUBLIC_PATHS = ["/login", "/register", "/reservation", "/landing", "/menu", "/special-event", "/table"];

function isPublicPath(pathname: string) {
  if (pathname === "/") return true;
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return true;
  }
  if (pathname.startsWith("/api/")) return true;
  return false;
}

function isStaticAsset(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/sounds/") ||
    pathname === "/manifest.json" ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  );
}

function isStatusPath(pathname: string) {
  return pathname === "/status" || pathname.startsWith("/status/");
}

const CANONICAL_HOST = "www.seoulprague.com";
const APEX_HOSTS = new Set(["seoulprague.com", "www.seoulprague.com"]);

function shouldForceHttps(request: NextRequest) {
  const proto = request.headers.get("x-forwarded-proto");
  // Local/dev stays http; production behind Vercel/proxy must land on https.
  if (process.env.NODE_ENV !== "production") return false;
  if (!proto) return false;
  return proto.split(",")[0]?.trim() === "http";
}

function canonicalHostRedirect(request: NextRequest) {
  const host = (request.headers.get("host") || "").toLowerCase().split(":")[0];
  if (!APEX_HOSTS.has(host)) return null;
  if (host === CANONICAL_HOST) return null;

  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.hostname = CANONICAL_HOST;
  url.port = "";
  return NextResponse.redirect(url, 308);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Guests typing www.seoulprague.com (no https) must still reach the site.
  if (shouldForceHttps(request)) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  const hostRedirect = canonicalHostRedirect(request);
  if (hostRedirect) return hostRedirect;

  if (isStaticAsset(pathname) || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (isStatusPath(pathname)) {
    return NextResponse.next();
  }

  const businessSession = await decodeAuthSession(request.cookies.get("pos_auth")?.value);
  if (!businessSession) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login" || pathname === "/register") {
    const staffLoginUrl = request.nextUrl.clone();
    staffLoginUrl.pathname = "/staff-login";
    return NextResponse.redirect(staffLoginUrl);
  }

  if (pathname === "/staff-login") {
    return NextResponse.next();
  }

  if (isStationPath(pathname)) {
    return NextResponse.next();
  }

  const staffSession = await decodeStaffSession(request.cookies.get(STAFF_COOKIE_NAME)?.value);
  if (!staffSession || staffSession.businessId !== businessSession.businessId) {
    const staffLoginUrl = request.nextUrl.clone();
    staffLoginUrl.pathname = "/staff-login";
    staffLoginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(staffLoginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
