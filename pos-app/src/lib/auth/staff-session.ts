import { cookies } from "next/headers";
import {
  STAFF_COOKIE_NAME,
  decodeStaffSession,
  encodeStaffSession,
  type StaffSessionPayload,
} from "@/src/lib/auth/staff-session-token";

export {
  STAFF_COOKIE_NAME,
  type StaffSessionPayload,
} from "@/src/lib/auth/staff-session-token";
export { decodeStaffSession, encodeStaffSession } from "@/src/lib/auth/staff-session-token";

export async function readStaffSession(): Promise<StaffSessionPayload | null> {
  const cookieStore = await cookies();
  return decodeStaffSession(cookieStore.get(STAFF_COOKIE_NAME)?.value);
}

export async function writeStaffSession(payload: StaffSessionPayload) {
  const cookieStore = await cookies();
  cookieStore.set(STAFF_COOKIE_NAME, await encodeStaffSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearStaffSession() {
  const cookieStore = await cookies();
  cookieStore.delete(STAFF_COOKIE_NAME);
}
