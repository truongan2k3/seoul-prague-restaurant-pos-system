"use client";

import { useState, type CSSProperties } from "react";
import { Minus, Plus, RotateCw, Sparkles } from "lucide-react";
import { VoucherCardFace } from "@/components/voucher-card-preview";
import {
  DEFAULT_VOUCHER_CONFIG,
  formatVoucherAmount,
  type VoucherConfig,
} from "@/lib/voucher";

/** Per-denomination visual identity — same system, distinct accents. */
const CARD_THEMES: Record<
  number,
  { label: string; wash: string; edge: string; gem: string; foil: string }
> = {
  1000: {
    label: "Classic",
    wash: "from-[#1a1512] via-[#121214] to-[#0B0B0C]",
    edge: "rgba(201,168,139,0.35)",
    gem: "#C9A88B",
    foil: "from-[#C9A88B]/25 via-transparent to-[#8B1E2D]/15",
  },
  2000: {
    label: "Signature",
    wash: "from-[#14161a] via-[#121214] to-[#0B0B0C]",
    edge: "rgba(232,213,196,0.4)",
    gem: "#E8D5C4",
    foil: "from-[#E8D5C4]/20 via-transparent to-[#C9A88B]/12",
  },
  3000: {
    label: "Reserve",
    wash: "from-[#161418] via-[#121214] to-[#0B0B0C]",
    edge: "rgba(186,170,150,0.42)",
    gem: "#BAAA96",
    foil: "from-[#BAAA96]/24 via-transparent to-[#C9A88B]/12",
  },
  5000: {
    label: "Prestige",
    wash: "from-[#1c1610] via-[#16120e] to-[#0B0B0C]",
    edge: "rgba(212,175,105,0.45)",
    gem: "#D4AF69",
    foil: "from-[#D4AF69]/28 via-transparent to-[#C9A88B]/10",
  },
};

function themeFor(amount: number) {
  return (
    CARD_THEMES[amount] ?? {
      label: "Gift",
      wash: "from-[#161618] via-[#121214] to-[#0B0B0C]",
      edge: "rgba(201,168,139,0.35)",
      gem: "#C9A88B",
      foil: "from-[#C9A88B]/20 via-transparent to-transparent",
    }
  );
}

/** Subtle paper grain without external assets. */
const GRAIN_STYLE: CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.45'/%3E%3C/svg%3E\")",
};

type DenominationSelectorProps = {
  denominations: number[];
  denomination: number;
  quantity: number;
  onDenominationChange: (value: number) => void;
  onQuantityChange: (value: number) => void;
  stepChooseLabel?: string;
  stepChooseHint?: string;
  stepQuantityLabel?: string;
  quantityLabel?: string;
  giftVoucherLabel?: string;
};

export function VoucherDenominationSelector({
  denominations,
  denomination,
  quantity,
  onDenominationChange,
  onQuantityChange,
  stepChooseLabel = "1 · Choose amount",
  stepChooseHint = "Select a luxury gift voucher denomination.",
  stepQuantityLabel = "2 · Quantity",
  quantityLabel = "Quantity",
  giftVoucherLabel = "Gift voucher",
}: DenominationSelectorProps) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.28em] text-white/40">{stepChooseLabel}</p>
      <p className="mt-2 text-sm text-white/45">{stepChooseHint}</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {denominations.map((value) => {
          const active = denomination === value;
          const theme = themeFor(value);
          return (
            <button
              key={value}
              type="button"
              onClick={() => onDenominationChange(value)}
              aria-pressed={active}
              className={`group relative isolate overflow-hidden rounded-2xl text-left transition duration-300 ease-out motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A88B] ${
                active
                  ? "scale-[1.01] shadow-[0_0_0_1px_rgba(201,168,139,0.55),0_18px_50px_-20px_rgba(201,168,139,0.45)]"
                  : "hover:-translate-y-1 hover:shadow-[0_20px_40px_-24px_rgba(0,0,0,0.9)]"
              }`}
              style={{ border: `1px solid ${active ? theme.edge : "rgba(255,255,255,0.1)"}` }}
            >
              <div className={`relative min-h-[136px] bg-gradient-to-br ${theme.wash} p-4 sm:p-5`}>
                <div
                  className={`pointer-events-none absolute inset-0 bg-gradient-to-tr ${theme.foil} opacity-80`}
                />
                <div
                  className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay"
                  style={GRAIN_STYLE}
                />
                <div
                  className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full blur-3xl transition-opacity duration-500"
                  style={{ background: theme.gem, opacity: active ? 0.22 : 0.08 }}
                />

                <div className="relative flex h-full flex-col justify-between">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p
                        className="text-[10px] font-semibold uppercase tracking-[0.28em]"
                        style={{ color: theme.gem }}
                      >
                        {giftVoucherLabel}
                      </p>
                      <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-white/35">
                        {theme.label}
                      </p>
                    </div>
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] transition-all duration-300 ${
                        active
                          ? "border-transparent text-[#0B0B0C]"
                          : "border-white/20 text-transparent group-hover:border-white/35"
                      }`}
                      style={active ? { background: theme.gem } : undefined}
                      aria-hidden
                    >
                      ✓
                    </span>
                  </div>

                  <div className="mt-6">
                    <p
                      className="landing-serif text-[clamp(1.35rem,4vw,2rem)] leading-none tracking-wide text-[#F5EDE4]"
                      style={active ? { textShadow: `0 0 40px ${theme.gem}55` } : undefined}
                    >
                      {formatVoucherAmount(value)}
                    </p>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-white/40">
                      Seoul Prague
                    </p>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-white/40">{stepQuantityLabel}</p>
            <p className="mt-1 text-sm text-white/50">
              {quantityLabel}: {formatVoucherAmount(denomination)}
            </p>
          </div>
          <div className="inline-flex items-center gap-3 self-start rounded-full border border-white/12 bg-black/30 px-2 py-1.5">
            <button
              type="button"
              aria-label="Decrease quantity"
              disabled={quantity <= 1}
              onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-white/80 transition hover:border-[#C9A88B]/50 hover:text-[#F5EDE4] disabled:opacity-30"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="min-w-[2.5rem] text-center text-xl font-semibold tabular-nums text-[#F5EDE4]">
              {quantity}
            </span>
            <button
              type="button"
              aria-label="Increase quantity"
              disabled={quantity >= 50}
              onClick={() => onQuantityChange(Math.min(50, quantity + 1))}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-white/80 transition hover:border-[#C9A88B]/50 hover:text-[#F5EDE4] disabled:opacity-30"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type PreviewProps = {
  voucherConfig?: VoucherConfig;
  denomination: number;
  quantity: number;
  total: number;
  previewLabel?: string;
  previewNote?: string;
  frontSideLabel?: string;
  backSideLabel?: string;
  flipActionLabel?: string;
  tapBadgeLabel?: string;
  hintFront?: string;
  hintBack?: string;
  totalLabel?: string;
};

/** Interactive 2-sided voucher card preview synchronized with the restaurant's voucher design. */
export function VoucherLivePreview({
  voucherConfig = DEFAULT_VOUCHER_CONFIG,
  denomination,
  quantity,
  total,
  previewLabel = "Your gift, beautifully presented",
  previewNote = "Illustrative 2-sided preview. Your unique voucher codes arrive by email after payment is verified.",
  frontSideLabel = "Front · Value & QR",
  backSideLabel = "Back · Terms & Info",
  flipActionLabel = "Flip card",
  tapBadgeLabel = "Tap card to flip",
  hintFront = "Displays voucher value & scannable QR code — click card or Back to preview terms and expiry.",
  hintBack = "Shows validity date, restaurant contact & usage terms — click card or Front to return.",
  totalLabel = "Total",
}: PreviewProps) {
  const [flipped, setFlipped] = useState(false);
  const [hasFlippedOnce, setHasFlippedOnce] = useState(false);

  const flipTo = (nextFlipped: boolean) => {
    setFlipped(nextFlipped);
    setHasFlippedOnce(true);
  };

  const toggleFlip = () => {
    setFlipped((prev) => !prev);
    setHasFlippedOnce(true);
  };

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.23em] text-[#C9A88B]">{previewLabel}</p>
        <button
          type="button"
          onClick={toggleFlip}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#C9A88B]/35 bg-[#C9A88B]/10 px-3 py-1 text-[11px] font-medium text-[#E8D5C4] transition hover:border-[#C9A88B]/70 hover:bg-[#C9A88B]/20"
        >
          {!hasFlippedOnce ? (
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#C9A88B] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#C9A88B]" />
            </span>
          ) : null}
          <RotateCw
            className={`h-3 w-3 text-[#C9A88B] transition-transform duration-500 ${
              flipped ? "rotate-180" : "rotate-0"
            }`}
            aria-hidden
          />
          <span>{tapBadgeLabel}</span>
        </button>
      </div>

      {/* 3D Flip Stage */}
      <div className="relative mt-5 pb-4" style={{ perspective: "1400px" }}>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-6 bottom-1 top-5 rotate-[-2.5deg] rounded-2xl border border-[#C9A88B]/15 bg-[#191613]/80 shadow-2xl"
        />
        <button
          type="button"
          onClick={toggleFlip}
          aria-pressed={flipped}
          aria-label={`${flipActionLabel}: ${flipped ? backSideLabel : frontSideLabel}`}
          className="group relative block w-full cursor-pointer rounded-xl text-left transition-transform duration-300 hover:scale-[1.01] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C9A88B] motion-reduce:hover:transform-none"
        >
          <div
            className="relative aspect-[1200/760] w-full transition-transform duration-700 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={{
              transformStyle: "preserve-3d",
              transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
          >
            {/* Front Face */}
            <div
              className="absolute inset-0 rounded-xl"
              style={{
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
                transform: "rotateY(0deg)",
                pointerEvents: flipped ? "none" : "auto",
                zIndex: flipped ? 0 : 1,
              }}
            >
              <VoucherCardFace
                config={voucherConfig}
                denominationCzk={denomination}
                side="front"
              />
            </div>

            {/* Back Face */}
            <div
              className="absolute inset-0 rounded-xl"
              style={{
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
                pointerEvents: flipped ? "auto" : "none",
                zIndex: flipped ? 1 : 0,
              }}
            >
              <VoucherCardFace
                config={voucherConfig}
                denominationCzk={denomination}
                side="back"
              />
            </div>
          </div>
        </button>
      </div>

      {/* Interactive Side Switcher & Flip Controls */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div
          className="inline-flex rounded-full border border-white/12 bg-white/[0.03] p-1"
          role="group"
          aria-label={previewLabel}
        >
          <button
            type="button"
            onClick={() => flipTo(false)}
            aria-pressed={!flipped}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              !flipped
                ? "bg-[#C9A88B] text-[#0B0B0C] shadow-sm"
                : "text-white/65 hover:text-white"
            }`}
          >
            {frontSideLabel}
          </button>
          <button
            type="button"
            onClick={() => flipTo(true)}
            aria-pressed={flipped}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              flipped
                ? "bg-[#C9A88B] text-[#0B0B0C] shadow-sm"
                : "text-white/65 hover:text-white"
            }`}
          >
            {backSideLabel}
          </button>
        </div>

        <button
          type="button"
          onClick={toggleFlip}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:border-[#C9A88B]/60 hover:text-[#F5EDE4]"
        >
          <RotateCw
            className={`h-3.5 w-3.5 text-[#C9A88B] transition-transform duration-500 ${
              flipped ? "rotate-180" : "rotate-0"
            }`}
            aria-hidden
          />
          {flipActionLabel}
        </button>
      </div>

      {/* Contextual Guest Interaction Hint */}
      <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#C9A88B]/20 bg-[#C9A88B]/[0.05] px-3.5 py-2.5 text-xs leading-relaxed text-[#E8D5C4]/85">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#C9A88B]" aria-hidden />
        <span>{flipped ? hintBack : hintFront}</span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 px-1 text-sm text-white/60">
        <span>{quantity} × {formatVoucherAmount(denomination)}</span>
        <span><span className="mr-2 text-xs text-white/40">{totalLabel}</span>{formatVoucherAmount(total)}</span>
      </div>
      <p className="mt-3 px-1 text-xs leading-relaxed text-white/40">{previewNote}</p>
    </div>
  );
}

type SummaryProps = {
  denomination: number;
  quantity: number;
  total: number;
  totalLabel?: string;
  voucherLabel?: string;
};

/** Clear cart-style summary for the selected denomination × quantity. */
export function VoucherOrderSummary({
  denomination,
  quantity,
  total,
  totalLabel = "Total",
  voucherLabel = "Voucher",
}: SummaryProps) {
  return (
    <div className="rounded-2xl border border-[#C9A88B]/25 bg-[#C9A88B]/[0.06] px-5 py-4">
      <p className="text-xs uppercase tracking-[0.24em] text-[#C9A88B]">{voucherLabel}</p>
      <div className="mt-3 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-white/70">
            <span className="landing-serif text-lg text-[#F5EDE4]">
              {formatVoucherAmount(denomination)}
            </span>
            <span className="text-white/40"> × {quantity}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">{totalLabel}</p>
          <p className="landing-serif text-2xl text-[#C9A88B]">{formatVoucherAmount(total)}</p>
        </div>
      </div>
    </div>
  );
}

