"use client";

import type { CSSProperties } from "react";
import { Minus, Plus } from "lucide-react";
import { formatVoucherAmount } from "@/lib/voucher";
import { LandingImage } from "@/lib/website/landing-image";

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
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-3 lg:gap-4">
        {denominations.map((value) => {
          const active = denomination === value;
          const theme = themeFor(value);
          return (
            <button
              key={value}
              type="button"
              onClick={() => onDenominationChange(value)}
              aria-pressed={active}
              className={`group relative isolate overflow-hidden rounded-2xl text-left transition-all duration-500 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A88B] ${
                active
                  ? "scale-[1.01] shadow-[0_0_0_1px_rgba(201,168,139,0.55),0_18px_50px_-20px_rgba(201,168,139,0.45)]"
                  : "hover:-translate-y-1 hover:shadow-[0_20px_40px_-24px_rgba(0,0,0,0.9)]"
              }`}
              style={{ border: `1px solid ${active ? theme.edge : "rgba(255,255,255,0.1)"}` }}
            >
              <div className={`relative min-h-[168px] bg-gradient-to-br ${theme.wash} p-5 sm:min-h-[190px] sm:p-5`}>
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

                  <div className="mt-8">
                    <p
                      className="landing-serif text-[2.15rem] leading-none tracking-wide text-[#F5EDE4] sm:text-[2.35rem]"
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
  brandName: string;
  logoUrl?: string | null;
  denomination: number;
  quantity: number;
  total: number;
};

export function VoucherLivePreview({
  brandName,
  logoUrl,
  denomination,
  quantity,
  total,
}: PreviewProps) {
  const theme = themeFor(denomination);

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.28em] text-white/40">Live preview</p>
      <div
        className={`relative mt-4 overflow-hidden rounded-2xl border bg-gradient-to-br ${theme.wash}`}
        style={{ borderColor: theme.edge }}
      >
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-tr ${theme.foil}`} />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08] mix-blend-overlay"
          style={GRAIN_STYLE}
        />
        <div
          className="pointer-events-none absolute -left-10 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full blur-3xl"
          style={{ background: theme.gem, opacity: 0.18 }}
        />

        <div className="relative grid gap-6 p-6 sm:grid-cols-[1.4fr_0.8fr] sm:p-8">
          <div className="flex flex-col justify-between">
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <LandingImage
                  src={logoUrl}
                  alt={brandName}
                  width={48}
                  height={48}
                  sizes="48px"
                  className="h-12 w-12 object-contain"
                />
              ) : (
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full border text-[10px] uppercase tracking-wider"
                  style={{ borderColor: theme.edge, color: theme.gem }}
                >
                  SP
                </div>
              )}
              <div>
                <p className="landing-serif text-lg tracking-wide text-[#F5EDE4]">{brandName}</p>
                <p className="text-[10px] uppercase tracking-[0.28em]" style={{ color: theme.gem }}>
                  Gift voucher · {theme.label}
                </p>
              </div>
            </div>

            <div className="mt-10 sm:mt-14">
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">Value</p>
              <p
                className="landing-serif mt-2 text-5xl leading-none tracking-wide text-[#F5EDE4] transition-all duration-500 sm:text-6xl"
                key={denomination}
                style={{
                  textShadow: `0 0 48px ${theme.gem}40`,
                }}
              >
                {formatVoucherAmount(denomination)}
              </p>
              <p className="mt-4 text-sm text-white/50">
                {quantity} × {formatVoucherAmount(denomination)}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end justify-between gap-4">
            <div
              className="relative flex h-28 w-28 items-center justify-center rounded-xl border bg-white/[0.04] sm:h-32 sm:w-32"
              style={{ borderColor: `${theme.gem}55` }}
              aria-hidden
            >
              <div
                className="absolute inset-3 opacity-70"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, transparent 46%, rgba(245,237,228,0.35) 46%, rgba(245,237,228,0.35) 54%, transparent 54%), linear-gradient(0deg, transparent 46%, rgba(245,237,228,0.35) 46%, rgba(245,237,228,0.35) 54%, transparent 54%)",
                  backgroundSize: "10px 10px",
                }}
              />
              <div className="relative h-10 w-10 rounded-sm border border-[#F5EDE4]/35 bg-[#0B0B0C]/50" />
              <p className="absolute bottom-2 text-[8px] uppercase tracking-[0.2em] text-white/35">
                QR
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/40">Order total</p>
              <p className="landing-serif mt-1 text-3xl text-[#C9A88B]">{formatVoucherAmount(total)}</p>
            </div>
          </div>
        </div>
      </div>
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

