import { cookies } from "next/headers";
import {
  AUTH_COOKIE_NAME,
  decodeAuthSession,
  encodeAuthSession,
  type AuthSessionPayload,
} from "@/src/lib/auth/session-token";

export { AUTH_COOKIE_NAME, type AuthSessionPayload } from "@/src/lib/auth/session-token";
export { decodeAuthSession, encodeAuthSession } from "@/src/lib/auth/session-token";

export async function readAuthSession(): Promise<AuthSessionPayload | null> {
  const cookieStore = await cookies();
  return decodeAuthSession(cookieStore.get(AUTH_COOKIE_NAME)?.value);
}

export async function writeAuthSession(payload: AuthSessionPayload) {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, await encodeAuthSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearAuthSession() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}
