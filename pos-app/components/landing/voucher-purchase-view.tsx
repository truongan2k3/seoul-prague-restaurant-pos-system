"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Download, Gift, Minus, Plus } from "lucide-react";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-menu-gallery";
import { formatVoucherAmount, type VoucherPaymentMethod } from "@/lib/voucher";
import type { WebsiteContent } from "@/lib/website/types";

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
};

export function VoucherPurchaseView({ content }: { content: WebsiteContent }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [denomination, setDenomination] = useState(1000);
  const [quantity, setQuantity] = useState(1);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<VoucherPaymentMethod>("czech_qr");
  const [previewQr, setPreviewQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);

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
        if (!cancelled) setError("Could not load voucher settings.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const total = denomination * quantity;

  const refreshPreviewQr = useCallback(async (amount: number) => {
    try {
      const response = await fetch(`/api/vouchers/payment-qr?amount=${encodeURIComponent(amount)}`);
      const payload = (await response.json()) as { qrDataUrl?: string | null };
      setPreviewQr(payload.qrDataUrl ?? null);
    } catch {
      setPreviewQr(null);
    }
  }, []);

  useEffect(() => {
    if (!config?.enabled || paymentMethod !== "czech_qr") {
      setPreviewQr(null);
      return;
    }
    const handle = window.setTimeout(() => {
      void refreshPreviewQr(total);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [config?.enabled, paymentMethod, total, refreshPreviewQr]);

  const bankReady = useMemo(() => {
    if (!config) return false;
    return Boolean(config.accountHolder || config.accountNumber || config.iban);
  }, [config]);

  const placeOrder = async () => {
    if (!config || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/vouchers/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName,
          buyerEmail,
          denominationCzk: denomination,
          quantity,
          paymentMethod,
        }),
      });
      const payload = (await response.json()) as {
        order?: PlacedOrder & { orderId: string };
        qrDataUrl?: string | null;
        error?: string;
      };
      if (!response.ok || !payload.order) {
        setError(payload.error || "Could not place order.");
        return;
      }
      setPlaced({
        orderId: payload.order.orderId,
        buyerEmail: payload.order.buyerEmail,
        denominationCzk: payload.order.denominationCzk,
        quantity: payload.order.quantity,
        totalCzk: payload.order.totalCzk,
        paymentMethod: payload.order.paymentMethod,
        paymentMessage: payload.order.paymentMessage,
        qrDataUrl: payload.qrDataUrl,
      });
    } catch {
      setError("Could not place order.");
    } finally {
      setBusy(false);
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
        <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">Gift vouchers</p>
        <h1 className="landing-serif mt-4 text-4xl tracking-wide text-[#F5EDE4] lg:text-6xl">
          Give Seoul Prague
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/55 lg:text-base">
          Purchase a gift voucher for friends or family. Pay by bank transfer or Czech banking QR —
          codes arrive by email after we confirm your payment (within 24 hours).
        </p>

        {!config ? (
          <p className="mt-16 text-sm text-white/45">Loading…</p>
        ) : !config.enabled ? (
          <p className="mt-16 rounded-2xl border border-white/10 bg-white/5 px-6 py-10 text-center text-sm text-white/60">
            Voucher sales are temporarily unavailable.
          </p>
        ) : placed ? (
          <section className="mt-12 space-y-6 rounded-2xl border border-[#C9A88B]/30 bg-[#121214] p-6 sm:p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#C9A88B]/20 text-[#C9A88B]">
              <Check className="h-6 w-6" />
            </div>
            <h2 className="landing-serif text-2xl text-[#F5EDE4]">Thank you</h2>
            <p className="text-sm leading-relaxed text-white/70">{config.processingMessage}</p>
            <dl className="space-y-2 text-sm text-white/75">
              <div className="flex justify-between gap-4">
                <dt className="text-white/45">Order ID</dt>
                <dd className="font-semibold tabular-nums text-[#F5EDE4]">{placed.orderId}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-white/45">Voucher</dt>
                <dd>
                  {formatVoucherAmount(placed.denominationCzk)} × {placed.quantity}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-white/45">Total</dt>
                <dd className="font-semibold text-[#C9A88B]">{formatVoucherAmount(placed.totalCzk)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-white/45">Email</dt>
                <dd>{placed.buyerEmail}</dd>
              </div>
            </dl>

            <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm">
              <p className="text-xs uppercase tracking-[0.16em] text-[#C9A88B]">Bank transfer</p>
              <ul className="mt-3 space-y-1.5 text-white/75">
                {config.accountHolder ? (
                  <li>
                    <span className="text-white/40">Account holder · </span>
                    {config.accountHolder}
                  </li>
                ) : null}
                {config.accountNumber ? (
                  <li>
                    <span className="text-white/40">Account · </span>
                    {config.accountNumber}
                  </li>
                ) : null}
                {config.iban ? (
                  <li>
                    <span className="text-white/40">IBAN · </span>
                    {config.iban}
                  </li>
                ) : null}
                {config.bankName ? (
                  <li>
                    <span className="text-white/40">Bank · </span>
                    {config.bankName}
                  </li>
                ) : null}
                <li>
                  <span className="text-white/40">Message · </span>
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
                  Scan with your Czech banking app · {formatVoucherAmount(placed.totalCzk)}
                </p>
                <button
                  type="button"
                  onClick={() => downloadQr(placed.qrDataUrl!, `voucher-pay-${placed.orderId}.png`)}
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-800"
                >
                  <Download className="h-3.5 w-3.5" />
                  Save QR
                </button>
              </div>
            ) : null}
          </section>
        ) : (
          <section className="mt-12 space-y-8">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">1 · Amount</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {config.denominationsCzk.map((value) => {
                  const active = denomination === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDenomination(value)}
                      className={`rounded-2xl border px-4 py-5 text-left transition ${
                        active
                          ? "border-[#C9A88B] bg-[#C9A88B]/15 text-[#F5EDE4]"
                          : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/25"
                      }`}
                    >
                      <Gift className={`mb-3 h-4 w-4 ${active ? "text-[#C9A88B]" : "text-white/35"}`} />
                      <p className="landing-serif text-2xl">{formatVoucherAmount(value)}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">2 · Quantity</p>
              <div className="mt-3 inline-flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <button
                  type="button"
                  aria-label="Decrease"
                  disabled={quantity <= 1}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/80 disabled:opacity-30"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-[2rem] text-center text-xl font-semibold tabular-nums">{quantity}</span>
                <button
                  type="button"
                  aria-label="Increase"
                  disabled={quantity >= 50}
                  onClick={() => setQuantity((q) => Math.min(50, q + 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/80 disabled:opacity-30"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex items-end justify-between border-y border-white/10 py-5">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-white/40">Total</p>
                <p className="landing-serif mt-1 text-3xl text-[#C9A88B] sm:text-4xl">
                  {formatVoucherAmount(total)}
                </p>
              </div>
              <p className="text-sm text-white/45">
                {quantity} × {formatVoucherAmount(denomination)}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs text-white/45">
                Your name
                <input
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm text-white outline-none focus:border-[#C9A88B]/60"
                  placeholder="Full name"
                />
              </label>
              <label className="block text-xs text-white/45">
                Email for voucher delivery
                <input
                  type="email"
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm text-white outline-none focus:border-[#C9A88B]/60"
                  placeholder="you@email.com"
                />
              </label>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">3 · Payment</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("czech_qr")}
                  className={`rounded-2xl border px-4 py-4 text-left text-sm ${
                    paymentMethod === "czech_qr"
                      ? "border-[#C9A88B] bg-[#C9A88B]/15"
                      : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  <p className="font-semibold text-[#F5EDE4]">Czech bank QR</p>
                  <p className="mt-1 text-xs text-white/45">SPD payment QR for Czech banking apps</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("bank_transfer")}
                  className={`rounded-2xl border px-4 py-4 text-left text-sm ${
                    paymentMethod === "bank_transfer"
                      ? "border-[#C9A88B] bg-[#C9A88B]/15"
                      : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  <p className="font-semibold text-[#F5EDE4]">Bank transfer</p>
                  <p className="mt-1 text-xs text-white/45">Manual transfer with order ID as note</p>
                </button>
              </div>
            </div>

            {bankReady ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/70">
                <p className="text-xs uppercase tracking-[0.16em] text-[#C9A88B]">Transfer to</p>
                <ul className="mt-3 space-y-1">
                  {config.accountHolder ? <li>{config.accountHolder}</li> : null}
                  {config.accountNumber ? <li>Account: {config.accountNumber}</li> : null}
                  {config.iban ? <li>IBAN: {config.iban}</li> : null}
                  {config.bankName ? <li>{config.bankName}</li> : null}
                  {config.bicSwift ? <li>BIC: {config.bicSwift}</li> : null}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-amber-200/80">
                Bank details are not configured yet. Please contact the restaurant before paying.
              </p>
            )}

            {paymentMethod === "czech_qr" && previewQr ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white p-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewQr} alt="Payment QR preview" className="h-52 w-52" />
                <p className="text-center text-xs text-zinc-600">
                  QR amount: {formatVoucherAmount(total)} · final QR uses your Order ID after place
                </p>
                <button
                  type="button"
                  onClick={() => downloadQr(previewQr, `voucher-qr-${total}.png`)}
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-800"
                >
                  <Download className="h-3.5 w-3.5" />
                  Save QR
                </button>
              </div>
            ) : null}

            {error ? <p className="text-sm text-red-300">{error}</p> : null}

            <button
              type="button"
              disabled={busy || !buyerName.trim() || !buyerEmail.trim()}
              onClick={() => void placeOrder()}
              className="w-full rounded-2xl bg-[#C9A88B] px-6 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-[#0B0B0C] transition hover:bg-[#d4b69a] disabled:opacity-40"
            >
              {busy ? "Placing order…" : "Place order"}
            </button>
          </section>
        )}
      </main>
      <LandingFooter content={content} showBookCta={false} />
    </div>
  );
}
