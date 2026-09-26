import { formatVoucherAmount, type VoucherConfig, type VoucherOrder } from "@/lib/voucher";
import { getReservationAppBaseUrl } from "@/src/lib/reservation-email";

const BRAND_NAME = "SEOUL PRAGUE";

type InlineAttachment = {
  filename: string;
  /** Raw base64 (no data: prefix). */
  content: string;
  content_id: string;
  content_type?: string;
};

function fromHeader(): string {
  const raw = process.env.RESEND_FROM_EMAIL?.trim() || "SEOUL PRAGUE <onboarding@resend.dev>";
  const angled = raw.match(/<([^>]+)>/);
  const email = angled?.[1]?.trim() || (raw.includes("@") && !raw.includes(" ") ? raw : "onboarding@resend.dev");
  return `${BRAND_NAME} <${email}>`;
}

/** Most clients strip data: URLs — embed via Resend content_id instead. */
function dataUrlToInlineAttachment(
  dataUrl: string,
  filename: string,
  contentId: string,
): InlineAttachment | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl.trim().replace(/\s+/g, ""));
  if (!match) return null;
  return {
    filename,
    content: match[2],
    content_id: contentId,
    content_type: match[1] || "image/png",
  };
}

async function sendResendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: InlineAttachment[];
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[voucher-email] RESEND_API_KEY not set — skipping email");
    return { sent: false, error: "Email is not configured" };
  }
  const body: Record<string, unknown> = {
    from: fromHeader(),
    to: [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
  };
  if (input.attachments && input.attachments.length > 0) {
    body.attachments = input.attachments;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[voucher-email] Resend error", response.status, detail);
    return { sent: false, error: detail || `Resend HTTP ${response.status}` };
  }
  return { sent: true };
}

function bankBlockHtml(config: VoucherConfig, order: VoucherOrder): string {
  const rows: string[] = [];
  if (config.accountHolder) {
    rows.push(
      `<tr><td style="padding:4px 0;color:#71717a">Account holder</td><td style="padding:4px 0;text-align:right;font-weight:600">${escapeHtml(config.accountHolder)}</td></tr>`,
    );
  }
  if (config.accountNumber) {
    rows.push(
      `<tr><td style="padding:4px 0;color:#71717a">Account number</td><td style="padding:4px 0;text-align:right;font-weight:600">${escapeHtml(config.accountNumber)}</td></tr>`,
    );
  }
  if (config.iban) {
    rows.push(
      `<tr><td style="padding:4px 0;color:#71717a">IBAN</td><td style="padding:4px 0;text-align:right;font-weight:600">${escapeHtml(config.iban)}</td></tr>`,
    );
  }
  if (config.bankName) {
    rows.push(
      `<tr><td style="padding:4px 0;color:#71717a">Bank</td><td style="padding:4px 0;text-align:right;font-weight:600">${escapeHtml(config.bankName)}</td></tr>`,
    );
  }
  if (config.bicSwift) {
    rows.push(
      `<tr><td style="padding:4px 0;color:#71717a">BIC/SWIFT</td><td style="padding:4px 0;text-align:right;font-weight:600">${escapeHtml(config.bicSwift)}</td></tr>`,
    );
  }
  rows.push(
    `<tr><td style="padding:4px 0;color:#71717a">Payment note</td><td style="padding:4px 0;text-align:right;font-weight:600">${escapeHtml(order.paymentMessage || order.orderId)}</td></tr>`,
  );
  return `<table style="width:100%;border-collapse:collapse;margin-top:12px">${rows.join("")}</table>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendVoucherConfirmationEmail(input: {
  order: VoucherOrder;
  config: VoucherConfig;
  qrDataUrl?: string | null;
}): Promise<{ sent: boolean; error?: string }> {
  const { order, config, qrDataUrl } = input;
  const subject = `${config.confirmationEmailSubject} · ${order.orderId}`;
  const amount = formatVoucherAmount(order.totalCzk);
  const unit = formatVoucherAmount(order.denominationCzk);
  const voucherUrl = `${getReservationAppBaseUrl()}/voucher`;

  const attachments: InlineAttachment[] = [];
  let qrBlock = "";
  if (qrDataUrl) {
    const attachment = dataUrlToInlineAttachment(
      qrDataUrl,
      `payment-qr-${order.orderId}.png`,
      "voucher-payment-qr",
    );
    if (attachment) {
      attachments.push(attachment);
      qrBlock = `<p style="margin:20px 0 8px;font-size:13px;color:#71717a;text-align:center">Czech bank payment QR · ${escapeHtml(amount)}</p>
       <img src="cid:voucher-payment-qr" alt="Payment QR" width="220" height="220" style="display:block;margin:0 auto;border-radius:12px;border:1px solid #e4e4e7" />`;
    }
  }

  const html = `<!DOCTYPE html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;background:#fafafa;color:#18181b;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:16px;padding:28px">
    <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a1a1aa">${BRAND_NAME}</p>
    <h1 style="margin:8px 0 12px;font-size:22px">Voucher order received</h1>
    <p style="line-height:1.55;color:#3f3f46">${escapeHtml(config.processingMessage)}</p>
    <p style="margin:16px 0 0"><strong>Order ID:</strong> ${escapeHtml(order.orderId)}</p>
    <p style="margin:6px 0"><strong>Voucher:</strong> ${escapeHtml(unit)} × ${order.quantity}</p>
    <p style="margin:6px 0"><strong>Total:</strong> ${escapeHtml(amount)}</p>
    <p style="margin:6px 0"><strong>Email:</strong> ${escapeHtml(order.buyerEmail)}</p>
    <p style="margin:16px 0 0;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;color:#92400e;font-size:14px;line-height:1.45">
      Please complete payment within <strong>15 minutes</strong> and tap <strong>I’ve paid</strong> on the confirmation page. Unpaid orders are cancelled automatically after the timer.
    </p>
    <p style="margin:12px 0 0;padding:12px;background:#fef3c7;border:1px solid #f59e0b;border-radius:10px;color:#92400e;font-size:14px;line-height:1.45;font-weight:600">
      Please also check your spam / junk folder — this confirmation and your voucher codes may appear there.
    </p>
    <h2 style="margin:24px 0 8px;font-size:16px">Bank transfer details</h2>
    ${bankBlockHtml(config, order)}
    ${config.bankPaymentNote ? `<p style="margin-top:12px;color:#71717a;font-size:13px">${escapeHtml(config.bankPaymentNote)}</p>` : ""}
    ${qrBlock}
    <p style="margin-top:24px;font-size:12px;color:#a1a1aa"><a href="${voucherUrl}" style="color:#a16207">Buy another voucher</a></p>
  </div>
</body></html>`;

  const text = [
    `${BRAND_NAME} — Voucher order received`,
    "",
    config.processingMessage,
    "",
    `Order ID: ${order.orderId}`,
    `Voucher: ${unit} × ${order.quantity}`,
    `Total: ${amount}`,
    `Email: ${order.buyerEmail}`,
    "",
    "Please pay within 15 minutes and tap “I’ve paid” on the website. Unpaid orders are cancelled after the timer.",
    "",
    "Please also check your spam / junk folder — this confirmation and your voucher codes may appear there.",
    "",
    "Bank transfer:",
    config.accountHolder && `Account holder: ${config.accountHolder}`,
    config.accountNumber && `Account number: ${config.accountNumber}`,
    config.iban && `IBAN: ${config.iban}`,
    config.bankName && `Bank: ${config.bankName}`,
    `Payment note: ${order.paymentMessage || order.orderId}`,
  ]
    .filter(Boolean)
    .join("\n");

  return sendResendEmail({
    to: order.buyerEmail,
    subject,
    html,
    text,
    attachments: attachments.length ? attachments : undefined,
  });
}

export async function sendVoucherIssuedEmail(input: {
  order: VoucherOrder;
  config: VoucherConfig;
  vouchers: { code: string; qrDataUrl: string }[];
}): Promise<{ sent: boolean; error?: string }> {
  const { order, config, vouchers } = input;
  const subject = `${config.issuedEmailSubject} · ${order.orderId}`;
  const unit = formatVoucherAmount(order.denominationCzk);

  const attachments: InlineAttachment[] = [];
  const cards = vouchers
    .map((v, index) => {
      const contentId = `voucher-code-qr-${index + 1}`;
      const attachment = dataUrlToInlineAttachment(v.qrDataUrl, `${v.code}.png`, contentId);
      const img = attachment
        ? (() => {
            attachments.push(attachment);
            return `<img src="cid:${contentId}" alt="Voucher QR ${escapeHtml(v.code)}" width="180" height="180" style="display:block;margin:0 auto;border-radius:8px" />`;
          })()
        : "";
      return `<div style="margin:16px 0;padding:16px;border:1px solid #e4e4e7;border-radius:12px;text-align:center">
      <p style="margin:0 0 8px;font-size:13px;color:#71717a">${escapeHtml(unit)} voucher</p>
      <p style="margin:0 0 12px;font-size:18px;font-weight:700;letter-spacing:0.06em">${escapeHtml(v.code)}</p>
      ${img}
    </div>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;background:#fafafa;color:#18181b;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:16px;padding:28px">
    <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a1a1aa">${BRAND_NAME}</p>
    <h1 style="margin:8px 0 12px;font-size:22px">Your voucher is ready</h1>
    <p style="line-height:1.55;color:#3f3f46">Payment confirmed for order <strong>${escapeHtml(order.orderId)}</strong>. Present the code or QR at the restaurant to redeem.</p>
    <p style="margin:12px 0 0;padding:12px;background:#fef3c7;border:1px solid #f59e0b;border-radius:10px;color:#92400e;font-size:14px;line-height:1.45;font-weight:600">
      If you did not see this email in your inbox, please check your spam / junk folder.
    </p>
    ${cards}
  </div>
</body></html>`;

  const text = [
    `${BRAND_NAME} — Your voucher is ready`,
    "",
    `Order ID: ${order.orderId}`,
    "If you did not see this email in your inbox, please check your spam / junk folder.",
    "",
    ...vouchers.map((v) => `Code: ${v.code} (${unit})`),
  ].join("\n");

  return sendResendEmail({
    to: order.buyerEmail,
    subject,
    html,
    text,
    attachments: attachments.length ? attachments : undefined,
  });
}
