"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, Globe } from "lucide-react";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-menu-gallery";
import { GuestChatWidget } from "@/components/landing/guest-chat-widget";
import {
  VoucherDenominationSelector,
  VoucherLivePreview,
  VoucherOrderSummary,
} from "@/components/landing/voucher-denomination-selector";
import {
  GUEST_RESERVATION_LANGS,
  type GuestReservationLang,
} from "@/lib/reservation-guest-form";
import {
  GUEST_LANG_SESSION_KEY,
  parseGuestReservationLang,
  persistGuestReservationLang,
  resolveInitialGuestReservationLang,
} from "@/lib/i18n/guest-reservation";
import { guestVoucherCopy } from "@/lib/i18n/guest-voucher";
import { formatVoucherAmount, type VoucherPaymentMethod } from "@/lib/voucher";
import type { WebsiteContent } from "@/lib/website/types";

const GUEST_LANG_LABELS: Record<GuestReservationLang, string> = {
  en: "English",
  cs: "Čeština",
  vi: "Tiếng Việt",
  de: "Deutsch",
  ko: "한국어",
};

type PublicConfig = {
  enabled: boolean;
  denominationsCzk: number[];
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  iban: string;
  bicSwift: string;
  bankPaymentNote: string;
  processingMessage: string;
  validityDays: number;
};

type PlacedOrder = {
  orderId: string;
  buyerEmail: string;
  denominationCzk: number;
  quantity: number;
  totalCzk: number;
  paymentMethod: VoucherPaymentMethod;
  paymentMessage?: string;
  qrDataUrl?: string | null;
  publicToken: string;
  paymentExpiresAt: string;
};

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function VoucherPurchaseView({ content }: { content: WebsiteContent }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [denomination, setDenomination] = useState(1000);
  const [quantity, setQuantity] = useState(1);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<VoucherPaymentMethod>("czech_qr");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [guestPaid, setGuestPaid] = useState(false);
  const [orderCancelled, setOrderCancelled] = useState(false);
  const [markBusy, setMarkBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const paymentSectionRef = useRef<HTMLElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [lang, setLang] = useState<GuestReservationLang>("en");
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const copy = guestVoucherCopy(lang);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem("reservation-guest-lang");
    } catch {
      /* ignore */
    }
    const stored = sessionStorage.getItem(GUEST_LANG_SESSION_KEY);
    const navigatorLangs =
      typeof navigator !== "undefined"
        ? [
            ...(Array.isArray(navigator.languages) ? navigator.languages : []),
            navigator.language,
          ].filter(Boolean)
        : [];
    setLang(resolveInitialGuestReservationLang(stored, navigatorLangs));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    persistGuestReservationLang(lang);
  }, [lang]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" in window ? "instant" : "auto" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/vouchers/config")
      .then((r) => r.json())
      .then((payload: { config?: PublicConfig }) => {
        if (cancelled || !payload.config) return;
        setConfig(payload.config);
        if (payload.config.denominationsCzk[0]) {
          setDenomination(payload.config.denominationsCzk[0]);
        }
      })
      .catch(() => {
        if (!cancelled) setError(guestVoucherCopy("en").loadError);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const total = denomination * quantity;
  const phoneDigits = buyerPhone.replace(/\D/g, "");
  const nameMissing = buyerName.trim().length === 0;
  const emailInvalid = !isValidEmail(buyerEmail);
  const phoneInvalid = phoneDigits.length < 6;
  const detailsReady = !nameMissing && !emailInvalid && !phoneInvalid;
  // Name is always highlighted while empty; other fields after submit/blur attempt.
  const nameError = nameMissing;
  const emailError = showFieldErrors && emailInvalid;
  const phoneError = showFieldErrors && phoneInvalid;

  const fieldClass = (hasError: boolean) =>
    `mt-1.5 w-full rounded-xl border bg-white/5 px-3 py-3 text-sm text-white outline-none transition ${
      hasError
        ? "border-red-500 bg-red-500/10 text-red-50 placeholder:text-red-200/50 focus:border-red-400"
        : "border-white/15 focus:border-[#C9A88B]/60"
    }`;

  const bankReady = useMemo(() => {
    if (!config) return false;
    return Boolean(config.accountHolder || config.accountNumber || config.iban);
  }, [config]);

  const tryPlaceOrder = () => {
    if (!config || busy) return;
    if (!detailsReady) {
      setShowFieldErrors(true);
      if (nameMissing) {
        nameInputRef.current?.focus();
        nameInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    void placeOrder();
  };

  const placeOrder = async () => {
    if (!config || busy || !detailsReady) {
      setShowFieldErrors(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/vouchers/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName,
          buyerEmail,
          buyerPhone,
          denominationCzk: denomination,
          quantity,
          paymentMethod,
        }),
      });
      const payload = (await response.json()) as {
        order?: PlacedOrder & {
          orderId: string;
          paymentExpiresAt?: string | null;
        };
        qrDataUrl?: string | null;
        publicToken?: string | null;
        paymentExpiresAt?: string | null;
        error?: string;
      };
      if (!response.ok || !payload.order || !payload.publicToken || !payload.paymentExpiresAt) {
        setError(payload.error || copy.placeError);
        return;
      }
      const expiresAt = payload.paymentExpiresAt;
      setPlaced({
        orderId: payload.order.orderId,
        buyerEmail: payload.order.buyerEmail,
        denominationCzk: payload.order.denominationCzk,
        quantity: payload.order.quantity,
        totalCzk: payload.order.totalCzk,
        paymentMethod: payload.order.paymentMethod,
        paymentMessage: payload.order.paymentMessage,
        qrDataUrl: payload.qrDataUrl,
        publicToken: payload.publicToken,
        paymentExpiresAt: expiresAt,
      });
      setGuestPaid(false);
      setOrderCancelled(false);
      setRemainingSeconds(
        Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)),
      );
      window.setTimeout(() => {
        paymentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    } catch {
      setError(copy.placeError);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!placed || guestPaid || orderCancelled) return;
    const tick = window.setInterval(() => {
      const left = Math.max(
        0,
        Math.ceil((new Date(placed.paymentExpiresAt).getTime() - Date.now()) / 1000),
      );
      setRemainingSeconds(left);
      if (left <= 0) {
        window.clearInterval(tick);
        void fetch(
          `/api/vouchers/guest/status?orderId=${encodeURIComponent(placed.orderId)}&token=${encodeURIComponent(placed.publicToken)}`,
        )
          .then((r) => r.json())
          .then((payload: { order?: { paymentStatus?: string } }) => {
            if (payload.order?.paymentStatus === "cancelled") {
              setOrderCancelled(true);
            } else {
              setOrderCancelled(true);
            }
          })
          .catch(() => setOrderCancelled(true));
      }
    }, 1000);
    return () => window.clearInterval(tick);
  }, [placed, guestPaid, orderCancelled]);

  const markPaid = async () => {
    if (!placed || markBusy || guestPaid || orderCancelled) return;
    setMarkBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/vouchers/guest/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: placed.orderId, token: placed.publicToken }),
      });
      const payload = (await response.json()) as {
        order?: { guestMarkedPaidAt?: string | null; paymentStatus?: string };
        error?: string;
      };
      if (payload.order?.paymentStatus === "cancelled" || response.status === 410) {
        setOrderCancelled(true);
        setError(payload.error || copy.windowExpired);
        return;
      }
      if (!response.ok) {
        setError(payload.error || copy.confirmError);
        return;
      }
      setGuestPaid(true);
    } catch {
      setError(copy.confirmError);
    } finally {
      setMarkBusy(false);
    }
  };

  const cancelOrder = async () => {
    if (!placed || cancelBusy || guestPaid || orderCancelled) return;
    setCancelBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/vouchers/guest/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: placed.orderId, token: placed.publicToken }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error || copy.cancelError);
        return;
      }
      setOrderCancelled(true);
    } catch {
      setError(copy.cancelError);
    } finally {
      setCancelBusy(false);
    }
  };

  const downloadQr = (dataUrl: string, filename: string) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
  };

  return (
    <div className="landing-theme min-h-screen bg-[#0B0B0C] text-white">
      <LandingNavbar content={content} hideBookCta />
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-28 lg:px-8 lg:pt-32">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">{copy.eyebrow}</p>
            <h1 className="landing-serif mt-4 text-4xl tracking-wide text-[#F5EDE4] lg:text-6xl">
              {copy.title}
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/55 lg:text-base">
              {copy.subtitle}
            </p>
          </div>
          <label className="inline-flex items-center gap-2 border border-white/15 bg-[#121214] px-3 py-2 text-sm">
            <Globe className="h-4 w-4 text-[#C9A88B]" />
            <select
              value={lang}
              onChange={(event) => setLang(parseGuestReservationLang(event.target.value))}
              className="bg-transparent text-white outline-none"
              aria-label="Language"
            >
              {GUEST_RESERVATION_LANGS.map((code) => (
                <option key={code} value={code} className="bg-[#121214]">
                  {GUEST_LANG_LABELS[code]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!config ? (
          <p className="mt-16 text-sm text-white/45">{copy.loading}</p>
        ) : !config.enabled ? (
          <p className="mt-16 rounded-2xl border border-white/10 bg-white/5 px-6 py-10 text-center text-sm text-white/60">
            {copy.unavailable}
          </p>
        ) : placed ? (
          <section
            ref={paymentSectionRef}
            className="mt-12 scroll-mt-28 space-y-6 rounded-2xl border border-[#C9A88B]/30 bg-[#121214] p-6 sm:p-8"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#C9A88B]/20 text-[#C9A88B]">
              <Check className="h-6 w-6" />
            </div>
            <h2 className="landing-serif text-2xl text-[#F5EDE4]">
              {orderCancelled
                ? copy.orderCancelled
                : guestPaid
                  ? copy.paymentSubmitted
                  : copy.completePayment}
            </h2>

            {orderCancelled ? (
              <p className="text-sm leading-relaxed text-white/70">{copy.cancelledBody}</p>
            ) : guestPaid ? (
              <p className="text-sm leading-relaxed text-white/70">
                {copy.paidBodyBefore}{" "}
                <span className="text-[#F5EDE4]">{placed.buyerEmail}</span> {copy.paidBodyAfter}
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-white/70">
                {copy.payNowBodyBefore}{" "}
                <strong className="text-[#F5EDE4]">{copy.payNowBodyStrong}</strong>{" "}
                {copy.payNowBodyAfter}
              </p>
            )}

            {!orderCancelled && !guestPaid ? (
              <div className="rounded-2xl border border-[#C9A88B]/40 bg-[#C9A88B]/10 px-5 py-4 text-center">
                <p className="text-xs uppercase tracking-[0.2em] text-[#C9A88B]">{copy.timeLeft}</p>
                <p className="landing-serif mt-1 text-4xl tabular-nums text-[#F5EDE4]">
                  {formatCountdown(remainingSeconds)}
                </p>
              </div>
            ) : null}

            <dl className="space-y-2 text-sm text-white/75">
              <div className="flex justify-between gap-4">
                <dt className="text-white/45">{copy.orderId}</dt>
                <dd className="font-semibold tabular-nums text-[#F5EDE4]">{placed.orderId}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-white/45">{copy.voucher}</dt>
                <dd>
                  {formatVoucherAmount(placed.denominationCzk)} × {placed.quantity}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-white/45">{copy.total}</dt>
                <dd className="font-semibold text-[#C9A88B]">{formatVoucherAmount(placed.totalCzk)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-white/45">{copy.email}</dt>
                <dd>{placed.buyerEmail}</dd>
              </div>
            </dl>

            {!orderCancelled ? (
              <>
                <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#C9A88B]">
                    {copy.bankTransferTitle}
                  </p>
                  <ul className="mt-3 space-y-1.5 text-white/75">
                    {config.accountHolder ? (
                      <li>
                        <span className="text-white/40">{copy.accountHolder} · </span>
                        {config.accountHolder}
                      </li>
                    ) : null}
                    {config.accountNumber ? (
                      <li>
                        <span className="text-white/40">{copy.account} · </span>
                        {config.accountNumber}
                      </li>
                    ) : null}
                    {config.iban ? (
                      <li>
                        <span className="text-white/40">{copy.iban} · </span>
                        {config.iban}
                      </li>
                    ) : null}
                    {config.bankName ? (
                      <li>
                        <span className="text-white/40">{copy.bank} · </span>
                        {config.bankName}
                      </li>
                    ) : null}
                    <li>
                      <span className="text-white/40">{copy.message} · </span>
                      {placed.paymentMessage || placed.orderId}
                    </li>
                  </ul>
                  {config.bankPaymentNote ? (
                    <p className="mt-3 text-xs text-white/45">{config.bankPaymentNote}</p>
                  ) : null}
                </div>

                {placed.qrDataUrl ? (
                  <div className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-white p-6">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={placed.qrDataUrl}
                      alt="Czech bank payment QR"
                      className="h-56 w-56"
                    />
                    <p className="text-center text-xs text-zinc-600">
                      {copy.scanQrHint} · {formatVoucherAmount(placed.totalCzk)}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        downloadQr(placed.qrDataUrl!, `voucher-pay-${placed.orderId}.png`)
                      }
                      className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-800"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {copy.saveQr}
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}

            {error ? <p className="text-sm text-red-300">{error}</p> : null}

            {!orderCancelled && !guestPaid ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={markBusy || remainingSeconds <= 0}
                  onClick={() => void markPaid()}
                  className="w-full rounded-2xl bg-[#C9A88B] px-6 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-[#0B0B0C] transition hover:bg-[#d4b69a] disabled:opacity-40"
                >
                  {markBusy ? copy.confirming : copy.ivePaid}
                </button>
                <button
                  type="button"
                  disabled={cancelBusy}
                  onClick={() => void cancelOrder()}
                  className="w-full rounded-2xl border border-red-400/40 px-6 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-red-200/90 transition hover:bg-red-500/10 disabled:opacity-40"
                >
                  {cancelBusy ? copy.cancelling : copy.cancelOrder}
                </button>
              </div>
            ) : null}

            {orderCancelled ? (
              <button
                type="button"
                onClick={() => {
                  setPlaced(null);
                  setError(null);
                  setOrderCancelled(false);
                  setGuestPaid(false);
                }}
                className="w-full rounded-2xl border border-white/20 px-6 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/80"
              >
                {copy.placeNewOrder}
              </button>
            ) : null}
          </section>
        ) : (
          <section className="mt-12 space-y-10 lg:space-y-12">
            <VoucherDenominationSelector
              denominations={config.denominationsCzk}
              denomination={denomination}
              quantity={quantity}
              onDenominationChange={(value) => {
                setDenomination(value);
                setQuantity(1);
              }}
              onQuantityChange={setQuantity}
              stepChooseLabel={copy.stepChoose}
              stepChooseHint={copy.stepChooseHint}
              stepQuantityLabel={copy.stepQuantity}
              quantityLabel={copy.quantityLabel}
              giftVoucherLabel={copy.voucher}
            />

            <VoucherLivePreview
              brandName={content.settings.restaurantName || "Seoul Prague"}
              logoUrl={content.media.logo?.fileUrl}
              denomination={denomination}
              quantity={quantity}
              total={total}
            />

            <VoucherOrderSummary
              denomination={denomination}
              quantity={quantity}
              total={total}
              totalLabel={copy.total}
              voucherLabel={copy.voucher}
            />

            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-white/40">{copy.stepDetails}</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label
                  className={`block text-xs sm:col-span-2 ${
                    nameError ? "text-red-300" : "text-white/45"
                  }`}
                >
                  {copy.fullName}
                  <input
                    ref={nameInputRef}
                    value={buyerName}
                    onChange={(e) => {
                      setBuyerName(e.target.value);
                      if (showFieldErrors && e.target.value.trim()) {
                        /* keep errors until all valid — cleared below */
                      }
                    }}
                    onBlur={() => {
                      if (nameMissing) setShowFieldErrors(true);
                    }}
                    className={fieldClass(nameError)}
                    placeholder={copy.fullNamePlaceholder}
                    autoComplete="name"
                    required
                    aria-invalid={nameError}
                  />
                  {nameError ? (
                    <span className="mt-1.5 block text-xs text-red-300">{copy.fullName} *</span>
                  ) : null}
                </label>
                <label className={`block text-xs ${emailError ? "text-red-300" : "text-white/45"}`}>
                  {copy.email}
                  <input
                    type="email"
                    value={buyerEmail}
                    onChange={(e) => setBuyerEmail(e.target.value)}
                    onBlur={() => {
                      if (emailInvalid) setShowFieldErrors(true);
                    }}
                    className={fieldClass(emailError)}
                    placeholder={copy.emailPlaceholder}
                    autoComplete="email"
                    required
                    aria-invalid={emailError}
                  />
                </label>
                <label className={`block text-xs ${phoneError ? "text-red-300" : "text-white/45"}`}>
                  {copy.phone}
                  <input
                    type="tel"
                    value={buyerPhone}
                    onChange={(e) => setBuyerPhone(e.target.value)}
                    onBlur={() => {
                      if (phoneInvalid) setShowFieldErrors(true);
                    }}
                    className={fieldClass(phoneError)}
                    placeholder={copy.phonePlaceholder}
                    autoComplete="tel"
                    required
                    aria-invalid={phoneError}
                  />
                </label>
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-white/40">{copy.stepPayment}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("czech_qr")}
                  className={`rounded-2xl border px-4 py-4 text-left text-sm transition duration-300 ${
                    paymentMethod === "czech_qr"
                      ? "border-[#C9A88B] bg-[#C9A88B]/15"
                      : "border-white/10 bg-white/[0.03] hover:border-white/25"
                  }`}
                >
                  <p className="font-semibold text-[#F5EDE4]">{copy.czechQrTitle}</p>
                  <p className="mt-1 text-xs text-white/45">{copy.czechQrHint}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("bank_transfer")}
                  className={`rounded-2xl border px-4 py-4 text-left text-sm transition duration-300 ${
                    paymentMethod === "bank_transfer"
                      ? "border-[#C9A88B] bg-[#C9A88B]/15"
                      : "border-white/10 bg-white/[0.03] hover:border-white/25"
                  }`}
                >
                  <p className="font-semibold text-[#F5EDE4]">{copy.bankTransferTitle}</p>
                  <p className="mt-1 text-xs text-white/45">{copy.bankTransferHint}</p>
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/65">
              <p className="text-xs uppercase tracking-[0.24em] text-[#C9A88B]">{copy.termsTitle}</p>
              <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
                <li>{copy.termValidity}</li>
                <li>{copy.termCounter}</li>
                <li>{copy.termNoCash}</li>
                <li>{copy.termContact}</li>
              </ul>
            </div>

            {error && !placed ? <p className="text-sm text-red-300">{error}</p> : null}

            <button
              type="button"
              disabled={busy || !bankReady}
              onClick={() => tryPlaceOrder()}
              className={`w-full rounded-2xl bg-[#C9A88B] px-6 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-[#0B0B0C] transition hover:bg-[#d4b69a] disabled:opacity-40 ${
                !detailsReady ? "opacity-50" : ""
              }`}
            >
              {busy
                ? copy.placingOrder
                : `${copy.placeOrder} · ${formatVoucherAmount(total)}`}
            </button>
            {!detailsReady ? (
              <p
                className={`text-center text-xs ${
                  showFieldErrors ? "text-red-300" : "text-white/40"
                }`}
              >
                {copy.detailsRequired}
              </p>
            ) : null}
            {!bankReady ? (
              <p className="text-center text-sm text-amber-200/80">{copy.bankNotConfigured}</p>
            ) : null}
          </section>
        )}
      </main>
      <LandingFooter content={content} showBookCta={false} />
      <GuestChatWidget page="voucher" />
    </div>
  );
}
