/** Gift voucher system — shared types, Czech SPD QR payload, config. */

export type VoucherPaymentMethod = "bank_transfer" | "czech_qr";

export type VoucherPaymentStatus = "pending" | "paid" | "cancelled" | "refunded";

export type VoucherOrderStatus =
  | "pending_verification"
  | "paid"
  | "issued"
  | "partially_redeemed"
  | "fully_redeemed"
  | "cancelled";

export type VoucherCodeStatus = "issued" | "applied" | "redeemed" | "cancelled" | "expired";

export interface VoucherCardDesign {
  /** Uploaded restaurant photo URL for card front background. */
  frontBackgroundUrl: string;
  /** Optional uploaded photo URL for card back background. */
  backBackgroundUrl: string;
  /** Optional uploaded restaurant logo URL shown on card front top-right. */
  logoUrl: string;
  /** Whether to show logo emblem on card front top-right. */
  showLogo: boolean;
  /** Top-left uppercase eyebrow title, e.g. "GIFT VOUCHER" / "DÁRKOVÝ POUKAZ". */
  frontTitle: string;
  /** Top-left brand & city line, e.g. "SEOUL PRAGUE · PRAHA". */
  frontBrandLine: string;
  /** Optional subtle subtitle line below brand line. */
  frontSubtitle: string;
  /** Accent color (borders, divider, gold headings). */
  accentColor: string;
  /** Deep card surface background color. */
  surfaceColor: string;
  /** Dark gradient overlay opacity on front photo (0–90). */
  frontOverlayOpacity: number;
  /** Render classic double-line luxury border frame. */
  showBorderFrame: boolean;
  /** Back card heading, e.g. "TERMS & CONDITIONS". */
  backTitle: string;
  /** Venue street address printed on back card. */
  venueAddress: string;
  /** Venue phone number printed on back card. */
  venuePhone: string;
  /** Venue contact email printed on back card. */
  venueEmail: string;
  /** Venue website printed on back card. */
  venueWebsite: string;
  /** English terms & conditions bullets on back card and email. */
  termsLines: string[];
}

export const DEFAULT_VOUCHER_DESIGN: VoucherCardDesign = {
  frontBackgroundUrl: "",
  backBackgroundUrl: "",
  logoUrl: "",
  showLogo: true,
  frontTitle: "GIFT VOUCHER",
  frontBrandLine: "SEOUL PRAGUE · PRAHA",
  frontSubtitle: "Korean BBQ & Culinary Experience",
  accentColor: "#C9A88B",
  surfaceColor: "#0b0a09",
  frontOverlayOpacity: 60,
  showBorderFrame: true,
  backTitle: "TERMS & CONDITIONS",
  venueAddress: "",
  venuePhone: "",
  venueEmail: "",
  venueWebsite: "",
  termsLines: [
    "Valid until the expiration date stated on this voucher.",
    "Present this voucher code or QR at the counter before paying your bill.",
    "Vouchers are applied at payment and have no cash redemption value.",
    "Reservations are recommended. Contact us for assistance anytime.",
  ],
};

export interface VoucherConfig {
  enabled: boolean;
  denominationsCzk: number[];
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  iban: string;
  bicSwift: string;
  bankPaymentNote: string;
  /** Days after issue until voucher expires; 0 = no expiry. */
  validityDays: number;
  processingMessage: string;
  confirmationEmailSubject: string;
  issuedEmailSubject: string;
  design?: VoucherCardDesign;
}

export const DEFAULT_VOUCHER_CONFIG: VoucherConfig = {
  enabled: true,
  denominationsCzk: [1000, 2000, 3000, 5000],
  bankName: "",
  accountHolder: "",
  accountNumber: "",
  iban: "",
  bicSwift: "",
  bankPaymentNote: "",
  validityDays: 365,
  processingMessage:
    "Thank you for ordering a voucher. Please complete payment within 15 minutes and tap “I’ve paid”. After we confirm your payment (within 24 hours), voucher codes will be sent to this email.",
  confirmationEmailSubject: "Voucher order received",
  issuedEmailSubject: "Your Gift Voucher",
  design: { ...DEFAULT_VOUCHER_DESIGN },
};

export const VOUCHER_PAYMENT_WINDOW_MINUTES = 15;
export const VOUCHER_RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Only payment-window cancellations can be recovered, for 24 hours after cancellation. */
export function voucherRecoveryDeadline(order: VoucherOrder): number | null {
  if (order.paymentStatus !== "cancelled" || order.orderStatus !== "cancelled" || order.guestMarkedPaidAt
    || order.notes !== "Auto-cancelled: payment window expired" || order.codes?.length) return null;
  const cancelledAt = new Date(order.cancelledAt ?? order.updatedAt).getTime();
  return Number.isFinite(cancelledAt) ? cancelledAt + VOUCHER_RECOVERY_WINDOW_MS : null;
}

export interface VoucherOrder {
  id: string;
  orderId: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  denominationCzk: number;
  quantity: number;
  totalCzk: number;
  paymentMethod: VoucherPaymentMethod;
  paymentStatus: VoucherPaymentStatus;
  orderStatus: VoucherOrderStatus;
  paymentMessage?: string;
  notes?: string;
  /** Guest must pay + mark paid before this time, or order auto-cancels. */
  paymentExpiresAt?: string | null;
  /** Guest confirmed they transferred / paid. */
  guestMarkedPaidAt?: string | null;
  verifiedAt?: string | null;
  verifiedByStaffName?: string | null;
  issuedAt?: string | null;
  cancelledAt?: string | null;
  publicToken?: string | null;
  createdAt: string;
  updatedAt: string;
  codes?: VoucherCode[];
}

export interface VoucherCode {
  id: string;
  orderUuid: string;
  code: string;
  denominationCzk: number;
  status: VoucherCodeStatus;
  expiresAt?: string | null;
  appliedTableId?: string | null;
  appliedAt?: string | null;
  appliedByStaffName?: string | null;
  redeemedAt?: string | null;
  redeemedByStaffName?: string | null;
  redeemedTableLabel?: string | null;
  redeemedSaleId?: string | null;
  createdAt: string;
}

function sanitizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : fallback;
}

export function parseVoucherDesign(raw: unknown): VoucherCardDesign {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_VOUCHER_DESIGN, termsLines: [...DEFAULT_VOUCHER_DESIGN.termsLines] };
  const row = raw as Record<string, unknown>;
  const overlay = Number(row.frontOverlayOpacity);
  const terms = Array.isArray(row.termsLines)
    ? row.termsLines.map((line) => String(line).trim()).filter(Boolean).slice(0, 10)
    : [...DEFAULT_VOUCHER_DESIGN.termsLines];
  return {
    frontBackgroundUrl:
      typeof row.frontBackgroundUrl === "string" ? row.frontBackgroundUrl.trim() : "",
    backBackgroundUrl:
      typeof row.backBackgroundUrl === "string" ? row.backBackgroundUrl.trim() : "",
    logoUrl: typeof row.logoUrl === "string" ? row.logoUrl.trim() : "",
    showLogo: typeof row.showLogo === "boolean" ? row.showLogo : DEFAULT_VOUCHER_DESIGN.showLogo,
    frontTitle:
      typeof row.frontTitle === "string" && row.frontTitle.trim()
        ? row.frontTitle.trim()
        : DEFAULT_VOUCHER_DESIGN.frontTitle,
    frontBrandLine:
      typeof row.frontBrandLine === "string"
        ? row.frontBrandLine.trim()
        : DEFAULT_VOUCHER_DESIGN.frontBrandLine,
    frontSubtitle:
      typeof row.frontSubtitle === "string"
        ? row.frontSubtitle.trim()
        : DEFAULT_VOUCHER_DESIGN.frontSubtitle,
    accentColor: sanitizeHexColor(row.accentColor, DEFAULT_VOUCHER_DESIGN.accentColor),
    surfaceColor: sanitizeHexColor(row.surfaceColor, DEFAULT_VOUCHER_DESIGN.surfaceColor),
    frontOverlayOpacity: Number.isFinite(overlay)
      ? Math.min(90, Math.max(0, Math.round(overlay)))
      : DEFAULT_VOUCHER_DESIGN.frontOverlayOpacity,
    showBorderFrame:
      typeof row.showBorderFrame === "boolean"
        ? row.showBorderFrame
        : DEFAULT_VOUCHER_DESIGN.showBorderFrame,
    backTitle:
      typeof row.backTitle === "string" && row.backTitle.trim()
        ? row.backTitle.trim()
        : DEFAULT_VOUCHER_DESIGN.backTitle,
    venueAddress: typeof row.venueAddress === "string" ? row.venueAddress.trim() : "",
    venuePhone: typeof row.venuePhone === "string" ? row.venuePhone.trim() : "",
    venueEmail: typeof row.venueEmail === "string" ? row.venueEmail.trim() : "",
    venueWebsite: typeof row.venueWebsite === "string" ? row.venueWebsite.trim() : "",
    termsLines: terms,
  };
}

export function getResolvedVoucherDesign(config: VoucherConfig): VoucherCardDesign {
  return parseVoucherDesign(config.design);
}

export function parseVoucherConfig(raw: unknown): VoucherConfig {
  if (!raw || typeof raw !== "object") {
    return {
      ...DEFAULT_VOUCHER_CONFIG,
      design: { ...DEFAULT_VOUCHER_DESIGN, termsLines: [...DEFAULT_VOUCHER_DESIGN.termsLines] },
    };
  }
  const row = raw as Record<string, unknown>;
  const dens = Array.isArray(row.denominationsCzk)
    ? row.denominationsCzk
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0)
        .map((n) => Math.round(n))
    : DEFAULT_VOUCHER_CONFIG.denominationsCzk;
  const validity = Number(row.validityDays);
  return {
    enabled: typeof row.enabled === "boolean" ? row.enabled : DEFAULT_VOUCHER_CONFIG.enabled,
    denominationsCzk: dens.length > 0 ? dens : [...DEFAULT_VOUCHER_CONFIG.denominationsCzk],
    bankName: typeof row.bankName === "string" ? row.bankName : DEFAULT_VOUCHER_CONFIG.bankName,
    accountHolder:
      typeof row.accountHolder === "string" ? row.accountHolder : DEFAULT_VOUCHER_CONFIG.accountHolder,
    accountNumber:
      typeof row.accountNumber === "string" ? row.accountNumber : DEFAULT_VOUCHER_CONFIG.accountNumber,
    iban: typeof row.iban === "string" ? row.iban : DEFAULT_VOUCHER_CONFIG.iban,
    bicSwift: typeof row.bicSwift === "string" ? row.bicSwift : DEFAULT_VOUCHER_CONFIG.bicSwift,
    bankPaymentNote:
      typeof row.bankPaymentNote === "string"
        ? row.bankPaymentNote
        : DEFAULT_VOUCHER_CONFIG.bankPaymentNote,
    validityDays:
      Number.isFinite(validity) && validity >= 0
        ? Math.min(3650, Math.round(validity))
        : DEFAULT_VOUCHER_CONFIG.validityDays,
    processingMessage:
      typeof row.processingMessage === "string" && row.processingMessage.trim()
        ? row.processingMessage.trim()
        : DEFAULT_VOUCHER_CONFIG.processingMessage,
    confirmationEmailSubject:
      typeof row.confirmationEmailSubject === "string" && row.confirmationEmailSubject.trim()
        ? row.confirmationEmailSubject.trim()
        : DEFAULT_VOUCHER_CONFIG.confirmationEmailSubject,
    issuedEmailSubject:
      typeof row.issuedEmailSubject === "string" && row.issuedEmailSubject.trim()
        ? row.issuedEmailSubject.trim()
        : DEFAULT_VOUCHER_CONFIG.issuedEmailSubject,
    design: parseVoucherDesign(row.design),
  };
}

export function voucherConfigToDb(config: VoucherConfig) {
  return {
    enabled: config.enabled,
    denominationsCzk: config.denominationsCzk,
    bankName: config.bankName,
    accountHolder: config.accountHolder,
    accountNumber: config.accountNumber,
    iban: config.iban,
    bicSwift: config.bicSwift,
    bankPaymentNote: config.bankPaymentNote,
    validityDays: config.validityDays,
    processingMessage: config.processingMessage,
    confirmationEmailSubject: config.confirmationEmailSubject,
    issuedEmailSubject: config.issuedEmailSubject,
    design: parseVoucherDesign(config.design),
  };
}

/** Public payment message: Order ID + brand tag. */
export function buildVoucherPaymentMessage(orderId: string): string {
  return `${orderId} Seoul Prague Voucher`;
}

/**
 * Czech Short Payment Descriptor (SPD*1.0) for banking apps.
 * @see https://qr-platba.cz/pro-vyvojare/specifikace-formatu/
 */
export function buildCzechSpdPayload(input: {
  iban: string;
  amountCzk: number;
  message: string;
  variableSymbol?: string;
}): string | null {
  const iban = input.iban.replace(/\s+/g, "").toUpperCase();
  if (!iban || iban.length < 15) return null;
  const amount = Math.max(0, Number(input.amountCzk));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const am = amount.toFixed(2);
  const msg = sanitizeSpdField(input.message, 60);
  const parts = [`SPD*1.0*ACC:${iban}*AM:${am}*CC:CZK`];
  if (msg) parts.push(`MSG:${msg}`);
  const vs = (input.variableSymbol ?? "").replace(/\D/g, "").slice(0, 10);
  if (vs) parts.push(`X-VS:${vs}`);
  return parts.join("*");
}

function sanitizeSpdField(value: string, max: number): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^*\r\n]+/g, (chunk) => chunk)
    .replace(/\*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Digits-only variable symbol from order id (max 10). */
export function variableSymbolFromOrderId(orderId: string): string {
  const digits = orderId.replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-10);
  // Fallback: hash-ish from chars
  let n = 0;
  for (let i = 0; i < orderId.length; i++) n = (n * 31 + orderId.charCodeAt(i)) % 1_000_000_0000;
  return String(Math.abs(n)).padStart(6, "0").slice(0, 10);
}

export function createVoucherOrderId(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = cryptoRandom(4).toUpperCase();
  return `SPV-${y}${m}${d}-${rand}`;
}

/** Unique guest-facing voucher code (not a DB uuid). */
export function createVoucherCode(): string {
  return `SPV-${cryptoRandom(10).toUpperCase()}`;
}

function cryptoRandom(byteLen: number): string {
  const bytes = new Uint8Array(byteLen);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < byteLen; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, byteLen * 2);
}

export function formatVoucherAmount(czk: number): string {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(czk);
}
