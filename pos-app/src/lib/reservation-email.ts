import type { ReservationStatus } from "@/lib/types";

const RESTAURANT_NAME = "SEOUL PRAGUE Korean BBQ";

export type ReservationEmailKind = "received" | "confirmed" | "updated" | "cancelled";

export interface ReservationEmailPayload {
  guestName: string;
  guestEmail: string;
  partySize: number;
  reservedAt: Date;
  bookingCode: string;
  manageUrl: string;
  notes?: string;
  status?: ReservationStatus;
}

export function getReservationAppBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

export function buildManageUrl(manageToken: string): string {
  return `${getReservationAppBaseUrl()}/reservation/manage?token=${encodeURIComponent(manageToken)}`;
}

function formatWhen(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function subjectFor(kind: ReservationEmailKind, bookingCode: string): string {
  switch (kind) {
    case "received":
      return `${RESTAURANT_NAME}: reservation request ${bookingCode}`;
    case "confirmed":
      return `${RESTAURANT_NAME}: reservation confirmed ${bookingCode}`;
    case "updated":
      return `${RESTAURANT_NAME}: reservation updated ${bookingCode}`;
    case "cancelled":
      return `${RESTAURANT_NAME}: reservation cancelled ${bookingCode}`;
  }
}

function introFor(kind: ReservationEmailKind): string {
  switch (kind) {
    case "received":
      return "We received your reservation request. Our team will confirm it shortly.";
    case "confirmed":
      return "Your reservation is confirmed. We look forward to welcoming you.";
    case "updated":
      return "Your reservation has been updated. Please review the new details below.";
    case "cancelled":
      return "Your reservation has been cancelled. You can book again anytime.";
  }
}

function buildHtml(kind: ReservationEmailKind, payload: ReservationEmailPayload): string {
  const when = formatWhen(payload.reservedAt);
  const manageBlock =
    kind === "cancelled"
      ? ""
      : `<p style="margin:24px 0 8px">
          <a href="${payload.manageUrl}" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">
            Manage reservation
          </a>
        </p>
        <p style="color:#71717a;font-size:12px">Or open: ${payload.manageUrl}</p>`;

  return `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#fafafa;color:#18181b;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:16px;padding:28px">
    <p style="margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#a1a1aa">${RESTAURANT_NAME}</p>
    <h1 style="margin:8px 0 12px;font-size:22px">${subjectFor(kind, payload.bookingCode)}</h1>
    <p style="margin:0 0 16px;color:#3f3f46">${introFor(kind)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:6px 0;color:#71717a">Code</td><td style="padding:6px 0;font-weight:600">${payload.bookingCode}</td></tr>
      <tr><td style="padding:6px 0;color:#71717a">Guest</td><td style="padding:6px 0;font-weight:600">${payload.guestName}</td></tr>
      <tr><td style="padding:6px 0;color:#71717a">When</td><td style="padding:6px 0;font-weight:600">${when}</td></tr>
      <tr><td style="padding:6px 0;color:#71717a">Party</td><td style="padding:6px 0;font-weight:600">${payload.partySize}</td></tr>
      ${
        payload.notes
          ? `<tr><td style="padding:6px 0;color:#71717a">Notes</td><td style="padding:6px 0">${payload.notes}</td></tr>`
          : ""
      }
    </table>
    ${manageBlock}
  </div>
</body>
</html>`;
}

function buildText(kind: ReservationEmailKind, payload: ReservationEmailPayload): string {
  const lines = [
    introFor(kind),
    "",
    `Code: ${payload.bookingCode}`,
    `Guest: ${payload.guestName}`,
    `When: ${formatWhen(payload.reservedAt)}`,
    `Party: ${payload.partySize}`,
  ];
  if (payload.notes) lines.push(`Notes: ${payload.notes}`);
  if (kind !== "cancelled") {
    lines.push("", `Manage: ${payload.manageUrl}`);
  }
  return lines.join("\n");
}

/** Sends via Resend REST API. No-ops (success) when API key is missing so booking still works. */
export async function sendReservationEmail(
  kind: ReservationEmailKind,
  payload: ReservationEmailPayload,
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.RESEND_FROM_EMAIL?.trim() || "SEOUL PRAGUE <onboarding@resend.dev>";

  if (!apiKey) {
    console.warn("[reservation-email] RESEND_API_KEY not set — skipping email");
    return { sent: false, error: "Email is not configured" };
  }

  const to = payload.guestEmail.trim();
  if (!to) return { sent: false, error: "No guest email" };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: subjectFor(kind, payload.bookingCode),
      html: buildHtml(kind, payload),
      text: buildText(kind, payload),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[reservation-email] Resend error", response.status, detail);
    return { sent: false, error: detail || `Resend HTTP ${response.status}` };
  }

  return { sent: true };
}
