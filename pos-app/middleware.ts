import { NextResponse, type NextRequest } from "next/server";
import { decodeAuthSession } from "@/src/lib/auth/session-token";
import { decodeStaffSession, STAFF_COOKIE_NAME } from "@/src/lib/auth/staff-session-token";
import { isStationPath } from "@/lib/page-routes";

const PUBLIC_PATHS = ["/login", "/register", "/reservation"];

function isPublicPath(pathname: string) {
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", pathname);
    }
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
    if (pathname !== "/") {
      staffLoginUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(staffLoginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
