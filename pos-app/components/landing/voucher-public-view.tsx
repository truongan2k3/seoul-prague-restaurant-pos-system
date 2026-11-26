"use client";

import { useState } from "react";
import { Download, FileText, Printer, RotateCw } from "lucide-react";
import { formatVoucherAmount, type VoucherCode, type VoucherOrder } from "@/lib/voucher";

type Props = {
  token: string;
  order: VoucherOrder;
  codes: VoucherCode[];
  brandLine: string;
};

function formatDateLabel(iso?: string | null): string {
  if (!iso) return "No expiration";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "issued":
    case "applied":
      return "border-emerald-500/40 bg-emerald-500/15 text-emerald-200";
    case "redeemed":
      return "border-sky-500/40 bg-sky-500/15 text-sky-200";
    default:
      return "border-rose-500/40 bg-rose-500/15 text-rose-200";
  }
}

export function VoucherPublicView({ token, order, codes, brandLine }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeSide, setActiveSide] = useState<"front" | "back">("front");
  const current = codes[activeIndex] ?? codes[0];

  if (!current) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-[#141210] p-8 text-center text-[#f5efe6]">
        <p className="text-lg font-medium">No voucher codes found for this order.</p>
      </div>
    );
  }

  const frontUrl = `/api/vouchers/public/card?token=${encodeURIComponent(token)}&code=${encodeURIComponent(current.code)}&side=front`;
  const backUrl = `/api/vouchers/public/card?token=${encodeURIComponent(token)}&code=${encodeURIComponent(current.code)}&side=back`;
  const pdfSingleUrl = `/api/vouchers/public/pdf?token=${encodeURIComponent(token)}&code=${encodeURIComponent(current.code)}`;
  const pdfAllUrl = `/api/vouchers/public/pdf?token=${encodeURIComponent(token)}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5 print:hidden">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#C9A88B]">
            {brandLine || "GIFT VOUCHER"}
          </p>
          <h1 className="mt-1 font-serif text-2xl text-[#fbf8f3] sm:text-3xl">
            Your Gift Voucher
          </h1>
          <p className="mt-1 text-xs text-stone-400">
            Order {order.orderId} · {formatVoucherAmount(current.denominationCzk || order.denominationCzk)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${statusBadgeClass(
              current.status,
            )}`}
          >
            {current.status}
          </span>
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-stone-300">
            Valid until: {formatDateLabel(current.expiresAt)}
          </span>
        </div>
      </header>

      {codes.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {codes.map((c, idx) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveIndex(idx)}
              className={`rounded-xl border px-3.5 py-2 font-mono text-xs font-semibold transition ${
                idx === activeIndex
                  ? "border-[#C9A88B] bg-[#C9A88B]/15 text-[#fbf8f3]"
                  : "border-white/10 bg-white/5 text-stone-400 hover:bg-white/10"
              }`}
            >
              #{idx + 1} · {c.code}
            </button>
          ))}
        </div>
      ) : null}

      {/* Interactive Toggle View (Screen) */}
      <div className="space-y-4 print:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] p-1">
            <button
              type="button"
              onClick={() => setActiveSide("front")}
              className={`rounded-lg px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
                activeSide === "front"
                  ? "bg-[#C9A88B] text-[#14110f]"
                  : "text-stone-300 hover:text-white"
              }`}
            >
              Front (Value &amp; QR)
            </button>
            <button
              type="button"
              onClick={() => setActiveSide("back")}
              className={`rounded-lg px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
                activeSide === "back"
                  ? "bg-[#C9A88B] text-[#14110f]"
                  : "text-stone-300 hover:text-white"
              }`}
            >
              Back (Terms &amp; Info)
            </button>
          </div>
          <button
            type="button"
            onClick={() => setActiveSide((s) => (s === "front" ? "back" : "front"))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-stone-300 transition hover:bg-white/10"
          >
            <RotateCw className="h-3.5 w-3.5" />
            Flip card
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#C9A88B]/30 bg-[#0b0a09] shadow-[0_24px_70px_rgba(0,0,0,0.65)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activeSide === "front" ? frontUrl : backUrl}
            alt={`Gift Voucher ${current.code} (${activeSide})`}
            className="block w-full h-auto"
          />
        </div>
      </div>

      {/* Both sides shown when printing from browser */}
      <div className="hidden space-y-6 print:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={frontUrl} alt="Voucher Front" className="w-full h-auto rounded-xl" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={backUrl} alt="Voucher Back" className="w-full h-auto rounded-xl" />
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3 pt-2 print:hidden">
        <a
          href={codes.length > 1 ? pdfAllUrl : pdfSingleUrl}
          className="inline-flex items-center gap-2 rounded-xl bg-[#C9A88B] px-5 py-3 text-sm font-semibold text-[#14110f] transition hover:bg-[#d8ba9f]"
        >
          <FileText className="h-4 w-4" />
          {codes.length > 1
            ? "Download All Vouchers (2-Sided PDF)"
            : "Download 2-Sided PDF"}
        </a>

        {codes.length > 1 ? (
          <a
            href={pdfSingleUrl}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-[#f5efe6] transition hover:bg-white/10"
          >
            <FileText className="h-4 w-4" />
            This Voucher PDF
          </a>
        ) : null}

        <a
          href={`${frontUrl}&download=1`}
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-[#f5efe6] transition hover:bg-white/10"
        >
          <Download className="h-4 w-4" />
          Front PNG
        </a>

        <a
          href={`${backUrl}&download=1`}
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-[#f5efe6] transition hover:bg-white/10"
        >
          <Download className="h-4 w-4" />
          Back PNG
        </a>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-[#f5efe6] transition hover:bg-white/10"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
      </div>
    </div>
  );
}
