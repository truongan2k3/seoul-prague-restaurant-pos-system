import { cookies } from "next/headers";
import {
  STATUS_ADMIN_COOKIE_NAME,
  decodeStatusAdminSession,
  encodeStatusAdminSession,
  type StatusAdminSessionPayload,
} from "@/src/lib/auth/status-admin-token";

export {
  STATUS_ADMIN_COOKIE_NAME,
  type StatusAdminSessionPayload,
} from "@/src/lib/auth/status-admin-token";

export async function readStatusAdminSession(): Promise<StatusAdminSessionPayload | null> {
  const cookieStore = await cookies();
  return decodeStatusAdminSession(cookieStore.get(STATUS_ADMIN_COOKIE_NAME)?.value);
}

export async function writeStatusAdminSession(payload: StatusAdminSessionPayload) {
  const cookieStore = await cookies();
  cookieStore.set(STATUS_ADMIN_COOKIE_NAME, await encodeStatusAdminSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearStatusAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(STATUS_ADMIN_COOKIE_NAME);
}
