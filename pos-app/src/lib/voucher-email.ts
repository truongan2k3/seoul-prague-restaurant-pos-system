import { formatVoucherAmount, type VoucherConfig, type VoucherOrder } from "@/lib/voucher";
import { getReservationAppBaseUrl } from "@/src/lib/reservation-email";

const BRAND_NAME = "SEOUL PRAGUE";

type InlineAttachment = {
  filename: string;
  /** Raw base64 (no data: prefix). */
  content: string;
  content_id?: string;
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatExpiryDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function greetingLine(buyerName?: string | null): string {
  const trimmed = buyerName?.trim();
  return trimmed ? `Hi ${trimmed},` : "Hello,";
}

function bankBlockHtml(config: VoucherConfig, order: VoucherOrder): string {
  const rows: string[] = [];
  if (config.accountHolder) {
    rows.push(
      `<tr><td style="padding:6px 0;color:#78716c;font-size:13px">Account holder</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#1c1917;font-size:13px">${escapeHtml(config.accountHolder)}</td></tr>`,
    );
  }
  if (config.accountNumber) {
    rows.push(
      `<tr><td style="padding:6px 0;color:#78716c;font-size:13px">Account number</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#1c1917;font-size:13px">${escapeHtml(config.accountNumber)}</td></tr>`,
    );
  }
  if (config.iban) {
    rows.push(
      `<tr><td style="padding:6px 0;color:#78716c;font-size:13px">IBAN</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#1c1917;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${escapeHtml(config.iban)}</td></tr>`,
    );
  }
  if (config.bankName) {
    rows.push(
      `<tr><td style="padding:6px 0;color:#78716c;font-size:13px">Bank</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#1c1917;font-size:13px">${escapeHtml(config.bankName)}</td></tr>`,
    );
  }
  if (config.bicSwift) {
    rows.push(
      `<tr><td style="padding:6px 0;color:#78716c;font-size:13px">BIC / SWIFT</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#1c1917;font-size:13px">${escapeHtml(config.bicSwift)}</td></tr>`,
    );
  }
  rows.push(
    `<tr><td style="padding:6px 0;color:#78716c;font-size:13px">Payment note</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#1c1917;font-size:13px">${escapeHtml(order.paymentMessage || order.orderId)}</td></tr>`,
  );
  return `<table style="width:100%;border-collapse:collapse;margin-top:8px">${rows.join("")}</table>`;
}

function validityTermLine(validityDays: number): string {
  if (validityDays <= 0) return "This voucher does not expire.";
  if (validityDays === 365 || validityDays === 366) {
    return "Voucher is valid for 12 months from the issue date.";
  }
  if (validityDays % 30 === 0) {
    return `Voucher is valid for ${validityDays / 30} months from the issue date.`;
  }
  return `Voucher is valid for ${validityDays} days from the issue date.`;
}

/** Same guest-facing T&C as /voucher and card back (English — emails are EN). */
function voucherTermsLines(config: VoucherConfig): string[] {
  const custom = config.design?.termsLines?.filter((line) => line.trim().length > 0);
  if (custom && custom.length > 0) {
    return custom;
  }
  return [
    validityTermLine(config.validityDays),
    "Vouchers are applied at the counter at payment. Please present the voucher code for staff to scan before paying your bill.",
    "In all cases, vouchers have no cash redemption value.",
    "For questions, please use Chat with us on our website or contact us by email / phone.",
  ];
}

function voucherTermsHtml(config: VoucherConfig): string {
  const items = voucherTermsLines(config)
    .map((line) => `<li style="margin:0 0 6px;line-height:1.55">${escapeHtml(line)}</li>`)
    .join("");
  return `<div style="margin-top:24px;padding:18px 20px;background:#faf8f5;border:1px solid #e7e0d6;border-radius:14px">
    <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#8c7a65;font-weight:700">Terms &amp; Conditions</p>
    <ul style="margin:0;padding-left:18px;color:#57534e;font-size:13px">${items}</ul>
  </div>`;
}

function voucherTermsText(config: VoucherConfig): string[] {
  return ["Terms & Conditions", ...voucherTermsLines(config).map((line) => `• ${line}`)];
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
  const greeting = greetingLine(order.buyerName);

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
      qrBlock = `<div style="margin-top:20px;padding:18px;background:#faf8f5;border:1px solid #e7e0d6;border-radius:14px;text-align:center">
        <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#8c7a65;font-weight:600">Czech Bank Payment QR · ${escapeHtml(amount)}</p>
        <div style="display:inline-block;padding:10px;background:#ffffff;border-radius:12px;border:1px solid #e7e0d6">
          <img src="cid:voucher-payment-qr" alt="Payment QR" width="200" height="200" style="display:block;margin:0 auto;border-radius:6px" />
        </div>
      </div>`;
    }
  }

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f6f3ee;color:#1c1917;padding:28px 16px">
  <div style="max-width:540px;margin:0 auto;background:#ffffff;border:1px solid #e7e0d6;border-radius:20px;overflow:hidden;box-shadow:0 6px 24px rgba(28,25,23,0.06)">
    <div style="height:5px;background:linear-gradient(90deg,#b88b58,#d4b084,#b88b58)"></div>
    <div style="padding:30px 28px">
      <p style="margin:0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#8c7a65;font-weight:700">${BRAND_NAME}</p>
      <h1 style="margin:10px 0 12px;font-size:24px;line-height:1.25;color:#1c1917;font-weight:700">Voucher order received</h1>
      <p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#44403c">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#44403c">${escapeHtml(config.processingMessage)}</p>

      <div style="padding:16px 18px;background:#faf8f5;border:1px solid #e7e0d6;border-radius:14px">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:5px 0;color:#78716c;font-size:13px">Order ID</td><td style="padding:5px 0;text-align:right;font-weight:600;color:#1c1917;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${escapeHtml(order.orderId)}</td></tr>
          <tr><td style="padding:5px 0;color:#78716c;font-size:13px">Voucher</td><td style="padding:5px 0;text-align:right;font-weight:600;color:#1c1917;font-size:13px">${escapeHtml(unit)} × ${order.quantity}</td></tr>
          <tr><td style="padding:5px 0;color:#78716c;font-size:13px">Total</td><td style="padding:5px 0;text-align:right;font-weight:700;color:#92400e;font-size:15px">${escapeHtml(amount)}</td></tr>
          <tr><td style="padding:5px 0;color:#78716c;font-size:13px">Email</td><td style="padding:5px 0;text-align:right;font-weight:500;color:#1c1917;font-size:13px">${escapeHtml(order.buyerEmail)}</td></tr>
        </table>
      </div>

      <div style="margin:16px 0 0;padding:13px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;color:#92400e;font-size:13.5px;line-height:1.5">
        Please complete payment within <strong>15 minutes</strong> and tap <strong>I’ve paid</strong> on the confirmation page. Unpaid orders are cancelled automatically after the timer.
      </div>
      <div style="margin:10px 0 0;padding:13px 16px;background:#fef3c7;border:1px solid #f59e0b;border-radius:12px;color:#92400e;font-size:13.5px;line-height:1.5;font-weight:600">
        Please also check your spam / junk folder — this confirmation and your voucher codes may appear there.
      </div>

      <h2 style="margin:24px 0 8px;font-size:15px;font-weight:700;color:#1c1917">Bank transfer details</h2>
      <div style="padding:12px 18px;background:#faf8f5;border:1px solid #e7e0d6;border-radius:14px">
        ${bankBlockHtml(config, order)}
      </div>
      ${config.bankPaymentNote ? `<p style="margin:10px 0 0;color:#78716c;font-size:13px;line-height:1.5">${escapeHtml(config.bankPaymentNote)}</p>` : ""}
      ${qrBlock}
      ${voucherTermsHtml(config)}

      <div style="margin-top:24px;padding-top:18px;border-top:1px solid #ede7de;display:flex;justify-content:space-between;align-items:center">
        <p style="margin:0;font-size:13px;color:#78716c">Thank you for choosing us!</p>
        <p style="margin:0;font-size:12px"><a href="${voucherUrl}" style="color:#92400e;font-weight:600;text-decoration:none">Buy another voucher →</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;

  const text = [
    `${BRAND_NAME} — Voucher order received`,
    "",
    greeting,
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
    "",
    ...voucherTermsText(config),
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
  vouchers: {
    code: string;
    qrDataUrl: string;
    expiresAt?: string | null;
    frontPng?: Buffer | null;
    backPng?: Buffer | null;
  }[];
  pdfBuffer?: Buffer | null;
  viewUrl?: string | null;
  isReissue?: boolean;
}): Promise<{ sent: boolean; error?: string }> {
  const { order, config, vouchers, pdfBuffer, viewUrl, isReissue } = input;
  const baseSubject = config.issuedEmailSubject?.trim() || "Your Gift Voucher";
  const subject = isReissue
    ? `${baseSubject} (Resent) · ${order.orderId}`
    : `${baseSubject} · ${order.orderId}`;
  const unit = formatVoucherAmount(order.denominationCzk);
  const greeting = greetingLine(order.buyerName);

  const introHtml = isReissue
    ? `As requested, we’re resending your gift voucher for order <strong>${escapeHtml(order.orderId)}</strong>. Your original voucher code remains unchanged and ready to use.`
    : `Thank you for your purchase! Payment for order <strong>${escapeHtml(order.orderId)}</strong> has been confirmed, and your gift voucher is ready to enjoy.`;

  const introText = isReissue
    ? `As requested, we're resending your gift voucher for order ${order.orderId}. Your original voucher code remains unchanged and ready to use.`
    : `Thank you for your purchase! Payment for order ${order.orderId} has been confirmed, and your gift voucher is ready to enjoy.`;

  const attachments: InlineAttachment[] = [];

  if (pdfBuffer && pdfBuffer.length > 0) {
    attachments.push({
      filename: `Gift-Voucher-${order.orderId}.pdf`,
      content: pdfBuffer.toString("base64"),
      content_type: "application/pdf",
    });
  }

  const cards = vouchers
    .map((v, index) => {
      const expiry = formatExpiryDate(v.expiresAt);
      if (v.frontPng && v.frontPng.length > 0) {
        const frontCid = `voucher-front-${index + 1}`;
        attachments.push({
          filename: `voucher-${v.code}-front.png`,
          content: v.frontPng.toString("base64"),
          content_id: frontCid,
          content_type: "image/png",
        });

        let backBlock = "";
        if (v.backPng && v.backPng.length > 0) {
          const backCid = `voucher-back-${index + 1}`;
          attachments.push({
            filename: `voucher-${v.code}-back.png`,
            content: v.backPng.toString("base64"),
            content_id: backCid,
            content_type: "image/png",
          });
          backBlock = `<div style="margin-top:16px">
            <p style="margin:0 0 8px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#8c7a65;font-weight:700">Back · Terms &amp; Details</p>
            <img src="cid:${backCid}" alt="Gift Voucher ${escapeHtml(v.code)} Back" style="width:100%;max-width:500px;height:auto;display:block;margin:0 auto;border-radius:14px;border:1px solid #dfd3c3" />
          </div>`;
        }

        return `<div style="margin:22px 0;padding:18px;background:#faf8f5;border:1px solid #e7e0d6;border-radius:16px;text-align:center">
          <p style="margin:0 0 8px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#8c7a65;font-weight:700">Front · Value &amp; QR</p>
          <img src="cid:${frontCid}" alt="Gift Voucher ${escapeHtml(v.code)} Front" style="width:100%;max-width:500px;height:auto;display:block;margin:0 auto;border-radius:14px;border:1px solid #dfd3c3" />
          ${backBlock}
          <p style="margin:12px 0 0;font-size:13px;color:#57534e;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">
            <strong>${escapeHtml(v.code)}</strong>${expiry ? ` · Valid until ${escapeHtml(expiry)}` : ""}
          </p>
        </div>`;
      }

      const contentId = `voucher-code-qr-${index + 1}`;
      const attachment = dataUrlToInlineAttachment(v.qrDataUrl, `${v.code}.png`, contentId);
      const img = attachment
        ? (() => {
            attachments.push(attachment);
            return `<div style="display:inline-block;padding:10px;background:#ffffff;border-radius:12px;border:1px solid #e7e0d6;margin-top:14px">
              <img src="cid:${contentId}" alt="Voucher QR ${escapeHtml(v.code)}" width="176" height="176" style="display:block;margin:0 auto;border-radius:6px" />
            </div>`;
          })()
        : "";
      const expiryHtml = expiry
        ? `<p style="margin:12px 0 0;font-size:12px;color:#78716c">Valid until <strong>${escapeHtml(expiry)}</strong></p>`
        : "";

      return `<div style="margin:18px 0;padding:24px 20px;background:linear-gradient(180deg,#fcfaf7 0%,#f5efe6 100%);border:1px solid #dfd3c3;border-radius:16px;text-align:center">
        <p style="margin:0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#8c7a65;font-weight:700">Gift Voucher</p>
        <p style="margin:6px 0 14px;font-size:26px;font-weight:800;color:#1c1917;letter-spacing:-0.01em">${escapeHtml(unit)}</p>
        <div style="display:inline-block;padding:10px 20px;background:#ffffff;border:1.5px dashed #c8b69e;border-radius:10px">
          <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:19px;font-weight:700;letter-spacing:0.08em;color:#1c1917">${escapeHtml(v.code)}</span>
        </div>
        <div>${img}</div>
        ${expiryHtml}
        <p style="margin:10px 0 0;font-size:12px;color:#8c7a65">Present this code or QR at the counter</p>
      </div>`;
    })
    .join("");

  const viewCtaHtml = viewUrl
    ? `<div style="margin:22px 0 4px;text-align:center">
        <a href="${escapeHtml(viewUrl)}" style="display:inline-block;background:#1c1917;color:#f5efe6;padding:13px 26px;border-radius:12px;text-decoration:none;font-size:14px;font-weight:600;border:1px solid #c9a88b">
          View Online &amp; Print Voucher (2-Sided)
        </a>
        ${pdfBuffer ? `<p style="margin:10px 0 0;font-size:12.5px;color:#78716c">A print-ready 2-sided PDF (front with QR &amp; value, back with terms &amp; expiry) is also attached below.</p>` : ""}
      </div>`
    : pdfBuffer
      ? `<p style="margin:16px 0 0;text-align:center;font-size:13px;color:#78716c">A print-ready 2-sided PDF (front with QR &amp; value, back with terms &amp; expiry) is attached to this email.</p>`
      : "";

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f6f3ee;color:#1c1917;padding:28px 16px">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e0d6;border-radius:20px;overflow:hidden;box-shadow:0 6px 24px rgba(28,25,23,0.06)">
    <div style="height:5px;background:linear-gradient(90deg,#b88b58,#d4b084,#b88b58)"></div>
    <div style="padding:30px 28px">
      <p style="margin:0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#8c7a65;font-weight:700">${BRAND_NAME}</p>
      <h1 style="margin:10px 0 12px;font-size:24px;line-height:1.25;color:#1c1917;font-weight:700">Your gift voucher is ready</h1>
      <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#44403c">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#44403c">${introHtml}</p>
      ${cards}
      ${viewCtaHtml}
      ${voucherTermsHtml(config)}
      <div style="margin-top:24px;padding-top:18px;border-top:1px solid #ede7de;text-align:center">
        <p style="margin:0;font-size:14px;color:#57534e">We look forward to welcoming you soon!</p>
      </div>
    </div>
  </div>
</body>
</html>`;

  const text = [
    `${BRAND_NAME} — Your gift voucher is ready`,
    "",
    greeting,
    "",
    introText,
    "",
    ...vouchers.map((v) => {
      const expiry = formatExpiryDate(v.expiresAt);
      return expiry ? `Code: ${v.code} (${unit} · Valid until ${expiry})` : `Code: ${v.code} (${unit})`;
    }),
    viewUrl ? "" : "",
    viewUrl ? `View online & print 2-sided PDF: ${viewUrl}` : "",
    pdfBuffer ? "A print-ready 2-sided PDF is attached to this email." : "",
    "",
    ...voucherTermsText(config),
    "",
    "We look forward to welcoming you soon!",
  ]
    .filter((line, idx, arr) => line !== "" || (idx > 0 && arr[idx - 1] !== ""))
    .join("\n");

  return sendResendEmail({
    to: order.buyerEmail,
    subject,
    html,
    text,
    attachments: attachments.length ? attachments : undefined,
  });
}
