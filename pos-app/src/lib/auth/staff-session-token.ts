export const STAFF_COOKIE_NAME = "pos_staff";

export interface StaffSessionPayload {
  staffId: string;
  businessId: string;
  username: string;
  staffName: string;
  staffRole: string;
}

const textEncoder = new TextEncoder();

function getAuthSecret() {
  return process.env.AUTH_SECRET ?? "pos-dev-auth-secret-change-in-production";
}

function toBase64Url(bytes: ArrayBuffer) {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url");
}

async function sign(data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(getAuthSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(data));
  return toBase64Url(signature);
}

export async function encodeStaffSession(payload: StaffSessionPayload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = await sign(data);
  return `${data}.${signature}`;
}

export async function decodeStaffSession(
  token: string | undefined | null,
): Promise<StaffSessionPayload | null> {
  if (!token) return null;
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;

  const expected = await sign(data);
  if (signature !== expected) return null;

  try {
    return JSON.parse(fromBase64Url(data).toString("utf8")) as StaffSessionPayload;
  } catch {
    return null;
  }
}
