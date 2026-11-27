import type { ReservationStatus } from "@/lib/types";

const BRAND_NAME = "Seoul Korean BBQ Prague";

export type ReservationEmailKind =
  | "received"
  | "confirmed"
  | "updated"
  | "cancelled"
  | "no_show";

export interface ReservationEmailPayload {
  guestName: string;
  guestEmail: string;
  partySize: number;
  reservedAt: Date;
  bookingCode: string;
  manageUrl: string;
  notes?: string;
  status?: ReservationStatus;
  /** Customer-safe cancellation message (never raw staff "Other" notes). */
  cancellationGuestMessage?: string;
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatWhen(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusBadgeFor(kind: ReservationEmailKind): {
  label: string;
  bg: string;
  fg: string;
  border: string;
} {
  switch (kind) {
    case "confirmed":
      return { label: "Confirmed", bg: "#ecfdf5", fg: "#065f46", border: "#a7f3d0" };
    case "received":
      return { label: "Request Received", bg: "#fffbeb", fg: "#92400e", border: "#fde68a" };
    case "updated":
      return { label: "Updated", bg: "#eff6ff", fg: "#1e40af", border: "#bfdbfe" };
    case "cancelled":
    case "no_show":
      return { label: "Cancelled", bg: "#fef2f2", fg: "#991b1b", border: "#fecaca" };
  }
}

function headingFor(kind: ReservationEmailKind): string {
  switch (kind) {
    case "received":
      return "Reservation request received";
    case "confirmed":
      return "Your table is confirmed";
    case "updated":
      return "Reservation updated";
    case "cancelled":
      return "Reservation cancelled";
    case "no_show":
      return "Reservation cancelled — no-show";
  }
}

function subjectFor(kind: ReservationEmailKind, bookingCode: string): string {
  switch (kind) {
    case "received":
      return `Reservation request received · ${bookingCode}`;
    case "confirmed":
      return `Table confirmed · ${bookingCode}`;
    case "updated":
      return `Reservation updated · ${bookingCode}`;
    case "cancelled":
      return `Reservation cancelled · ${bookingCode}`;
    case "no_show":
      return `Reservation cancelled (no-show) · ${bookingCode}`;
  }
}

function reservationFromHeader(): string {
  const raw = process.env.RESEND_FROM_EMAIL?.trim() || `${BRAND_NAME} <onboarding@resend.dev>`;
  const angled = raw.match(/<([^>]+)>/);
  const email =
    angled?.[1]?.trim() ||
    (raw.includes("@") && !raw.includes(" ") ? raw : "onboarding@resend.dev");
  return `${BRAND_NAME} <${email}>`;
}

function introFor(kind: ReservationEmailKind, payload: ReservationEmailPayload): string {
  switch (kind) {
    case "received":
      return "Thank you for your request! Our team is reviewing your booking and will confirm it shortly.";
    case "confirmed":
      return "Great news — your table reservation is confirmed. We look forward to welcoming you!";
    case "updated":
      return "Your reservation details have been updated. Please take a moment to review the summary below.";
    case "cancelled":
      return [
        "We're sorry to let you know that your reservation has been cancelled.",
        payload.cancellationGuestMessage
          ? `Reason: ${payload.cancellationGuestMessage}`
          : null,
        "We apologize for any inconvenience and hope to welcome you another time.",
      ]
        .filter(Boolean)
        .join(" ");
    case "no_show":
      return "Your reservation was cancelled as we were unable to welcome you on time. Feel free to book again anytime.";
  }
}

function buildHtml(kind: ReservationEmailKind, payload: ReservationEmailPayload): string {
  const when = formatWhen(payload.reservedAt);
  const badge = statusBadgeFor(kind);
  const intro = introFor(kind, payload);
  const heading = headingFor(kind);
  const guestGreeting = payload.guestName?.trim()
    ? `Hi ${escapeHtml(payload.guestName.trim())},`
    : "Hello,";

  const manageBlock =
    kind === "cancelled" || kind === "no_show"
      ? ""
      : `<div style="margin:26px 0 0;text-align:center">
          <a href="${escapeHtml(payload.manageUrl)}" style="display:inline-block;background:#1c1917;color:#fbf8f3;padding:13px 28px;border-radius:12px;text-decoration:none;font-size:14px;font-weight:600;border:1px solid #c9a88b">
            Manage Reservation
          </a>
          <p style="margin:10px 0 0;color:#78716c;font-size:12px">Need to adjust your time or party size? You can update or cancel anytime using the button above.</p>
        </div>`;

  return `<!DOCTYPE html>
<html>
<body style="margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f6f3ee;color:#1c1917;padding:28px 16px">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(intro)}</div>
  <div style="max-width:540px;margin:0 auto;background:#ffffff;border:1px solid #e7e0d6;border-radius:20px;overflow:hidden;box-shadow:0 6px 24px rgba(28,25,23,0.06)">
    <div style="height:5px;background:linear-gradient(90deg,#b88b58,#d4b084,#b88b58)"></div>
    <div style="padding:30px 28px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <p style="margin:0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#8c7a65;font-weight:700">${BRAND_NAME}</p>
        <span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;background:${badge.bg};color:${badge.fg};border:1px solid ${badge.border}">${badge.label}</span>
      </div>

      <h1 style="margin:14px 0 10px;font-size:24px;line-height:1.25;color:#1c1917;font-weight:700">${heading}</h1>
      <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#44403c">${guestGreeting}</p>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#44403c">${escapeHtml(intro)}</p>

      <div style="padding:18px 20px;background:#faf8f5;border:1px solid #e7e0d6;border-radius:14px">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr>
            <td style="padding:7px 0;color:#78716c">Booking Code</td>
            <td style="padding:7px 0;text-align:right;font-weight:700;color:#1c1917;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0.06em">${escapeHtml(payload.bookingCode)}</td>
          </tr>
          <tr>
            <td style="padding:7px 0;color:#78716c;border-top:1px solid #ede7de">Guest</td>
            <td style="padding:7px 0;text-align:right;font-weight:600;color:#1c1917;border-top:1px solid #ede7de">${escapeHtml(payload.guestName)}</td>
          </tr>
          <tr>
            <td style="padding:7px 0;color:#78716c;border-top:1px solid #ede7de">Date &amp; Time</td>
            <td style="padding:7px 0;text-align:right;font-weight:600;color:#92400e;border-top:1px solid #ede7de">${escapeHtml(when)}</td>
          </tr>
          <tr>
            <td style="padding:7px 0;color:#78716c;border-top:1px solid #ede7de">Party Size</td>
            <td style="padding:7px 0;text-align:right;font-weight:600;color:#1c1917;border-top:1px solid #ede7de">${payload.partySize} ${payload.partySize === 1 ? "guest" : "guests"}</td>
          </tr>
          ${
            payload.notes
              ? `<tr>
                  <td style="padding:7px 0;color:#78716c;border-top:1px solid #ede7de;vertical-align:top">Notes</td>
                  <td style="padding:7px 0;text-align:right;color:#44403c;border-top:1px solid #ede7de">${escapeHtml(payload.notes)}</td>
                </tr>`
              : ""
          }
        </table>
      </div>

      ${manageBlock}

      <div style="margin-top:26px;padding-top:18px;border-top:1px solid #ede7de;text-align:center">
        <p style="margin:0;font-size:13px;color:#78716c">Thank you for choosing us — see you soon!</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function buildText(kind: ReservationEmailKind, payload: ReservationEmailPayload): string {
  const lines = [
    BRAND_NAME,
    "",
    payload.guestName?.trim() ? `Hi ${payload.guestName.trim()},` : "Hello,",
    "",
    introFor(kind, payload),
    "",
    `Booking Code: ${payload.bookingCode}`,
    `Guest: ${payload.guestName}`,
    `Date & Time: ${formatWhen(payload.reservedAt)}`,
    `Party Size: ${payload.partySize} ${payload.partySize === 1 ? "guest" : "guests"}`,
  ];
  if (payload.notes) lines.push(`Notes: ${payload.notes}`);
  if (kind !== "cancelled" && kind !== "no_show") {
    lines.push("", `Manage reservation: ${payload.manageUrl}`);
  }
  lines.push("", "Thank you for choosing us — see you soon!");
  return lines.join("\n");
}

/** Sends via Resend REST API. No-ops (success) when API key is missing so booking still works. */
export async function sendReservationEmail(
  kind: ReservationEmailKind,
  payload: ReservationEmailPayload,
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = reservationFromHeader();

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
