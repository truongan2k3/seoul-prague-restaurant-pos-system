"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  formatVoucherAmount,
  getResolvedVoucherDesign,
  type VoucherConfig,
} from "@/lib/voucher";

function splitAmountParts(czk: number): { num: string; currency: string } {
  const formatted = formatVoucherAmount(czk);
  const match = formatted.match(/^([\d\s\u00a0.,]+)\s*(.*)$/);
  if (!match) return { num: String(czk), currency: "Kč" };
  return {
    num: match[1].trim(),
    currency: match[2].trim() || "Kč",
  };
}

function monogramFromBrand(brandLine: string): string {
  const words = brandLine
    .replace(/·.*/, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return "SP";
}

function formatSampleExpiry(validityDays: number): string {
  if (validityDays <= 0) return "No Expiration";
  const d = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function VoucherCardPreview({
  config,
  denominationCzk,
  side,
  sampleCode = "SPV-2026-DEMO",
}: {
  config: VoucherConfig;
  denominationCzk: number;
  side: "front" | "back" | "both";
  sampleCode?: string;
}) {
  const [qrUrl, setQrUrl] = useState<string>("");
  const design = getResolvedVoucherDesign(config);
  const amount = splitAmountParts(denominationCzk);
  const monogram = monogramFromBrand(design.frontBrandLine);
  const expiryLabel = formatSampleExpiry(config.validityDays);
  const overlayAlpha = Math.min(0.9, Math.max(0, design.frontOverlayOpacity / 100));

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(sampleCode, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#111111", light: "#ffffff" },
    })
      .then((url) => {
        if (active) setQrUrl(url);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      active = false;
    };
  }, [sampleCode]);

  const frontCard = (
    <div
      className="relative aspect-[1200/760] w-full overflow-hidden rounded-xl shadow-[0_18px_50px_rgba(0,0,0,0.45)] select-none"
      style={{ backgroundColor: design.surfaceColor, containerType: "inline-size" }}
    >
      {design.frontBackgroundUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={design.frontBackgroundUrl}
          alt="Voucher background preview"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at 65% 35%, ${design.accentColor}33, ${design.surfaceColor} 72%)`,
          }}
        />
      )}

      {/* Moody gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(125deg, ${design.surfaceColor}${Math.round(overlayAlpha * 235)
            .toString(16)
            .padStart(2, "0")} 0%, ${design.surfaceColor}${Math.round(overlayAlpha * 120)
            .toString(16)
            .padStart(2, "0")} 48%, ${design.surfaceColor}${Math.round(overlayAlpha * 215)
            .toString(16)
            .padStart(2, "0")} 100%)`,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, transparent 35%, ${design.surfaceColor}${Math.round(
            Math.min(0.95, overlayAlpha + 0.15) * 255,
          )
            .toString(16)
            .padStart(2, "0")} 100%)`,
        }}
      />

      {design.showBorderFrame ? (
        <>
          <div
            className="pointer-events-none absolute inset-[2.8%] rounded-[4px]"
            style={{ border: `1px solid ${design.accentColor}8c` }}
          />
          <div
            className="pointer-events-none absolute inset-[3.8%] rounded-[2px]"
            style={{ border: `1px solid ${design.accentColor}40` }}
          />
        </>
      ) : null}

      <div className="relative flex h-full flex-col justify-between p-[6.8%]">
        {/* Top Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p
              className="uppercase leading-tight"
              style={{
                color: design.accentColor,
                fontSize: "1.6cqw",
                letterSpacing: "0.24em",
              }}
            >
              {design.frontTitle}
            </p>
            {design.frontBrandLine ? (
              <p
                className="mt-[0.8cqw] uppercase leading-tight text-[#f5efe6]"
                style={{ fontSize: "1.85cqw", letterSpacing: "0.18em" }}
              >
                {design.frontBrandLine}
              </p>
            ) : null}
            {design.frontSubtitle ? (
              <p
                className="mt-[0.7cqw] leading-tight"
                style={{
                  color: `${design.accentColor}cc`,
                  fontSize: "1.3cqw",
                  letterSpacing: "0.06em",
                }}
              >
                {design.frontSubtitle}
              </p>
            ) : null}
          </div>

          {design.showLogo ? (
            <div
              className="flex shrink-0 items-center justify-center overflow-hidden rounded-full"
              style={{
                width: "7.5cqw",
                height: "7.5cqw",
                border: `1.5px solid ${design.accentColor}99`,
                backgroundColor: `${design.surfaceColor}a6`,
              }}
            >
              {design.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={design.logoUrl}
                  alt="Logo"
                  className="h-[74%] w-[74%] object-contain"
                />
              ) : (
                <span
                  className="font-serif"
                  style={{ color: design.accentColor, fontSize: "2.3cqw" }}
                >
                  {monogram}
                </span>
              )}
            </div>
          ) : null}
        </div>

        {/* Bottom Value + Front QR */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="mb-[1.2cqw] flex items-center">
              <span
                className="block h-[1.5px] w-[6cqw]"
                style={{ backgroundColor: `${design.accentColor}bf` }}
              />
              <span
                className="mx-[0.7cqw] block h-[0.65cqw] w-[0.65cqw] rotate-45"
                style={{ backgroundColor: design.accentColor }}
              />
              <span
                className="block h-[1px] w-[12cqw]"
                style={{ backgroundColor: `${design.accentColor}73` }}
              />
            </div>
            <div className="flex items-baseline">
              <span
                className="font-serif font-semibold leading-none text-[#fbf8f3]"
                style={{ fontSize: "8cqw" }}
              >
                {amount.num}
              </span>
              <span
                className="ml-[1.2cqw] font-serif italic leading-none"
                style={{ color: design.accentColor, fontSize: "4cqw" }}
              >
                {amount.currency}
              </span>
            </div>
          </div>

          <div
            className="flex shrink-0 flex-col items-center rounded-[1.3cqw] bg-white p-[1.15cqw]"
            style={{ border: `1.5px solid ${design.accentColor}cc` }}
          >
            {qrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrUrl}
                alt="QR preview"
                className="rounded-[0.4cqw]"
                style={{ width: "12.2cqw", height: "12.2cqw" }}
              />
            ) : (
              <div
                className="rounded bg-stone-200"
                style={{ width: "12.2cqw", height: "12.2cqw" }}
              />
            )}
            <span
              className="mt-[0.65cqw] font-mono font-bold tracking-wider text-stone-900"
              style={{ fontSize: "1.1cqw" }}
            >
              {sampleCode}
            </span>
            <span
              className="mt-[0.2cqw] uppercase tracking-widest text-stone-500"
              style={{ fontSize: "0.75cqw" }}
            >
              SCAN AT COUNTER
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  const venueItems = [
    design.venueAddress && { label: "ADDRESS", value: design.venueAddress },
    design.venuePhone && { label: "PHONE", value: design.venuePhone },
    design.venueEmail && { label: "EMAIL", value: design.venueEmail },
    design.venueWebsite && { label: "WEBSITE", value: design.venueWebsite },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const terms = (
    design.termsLines.length > 0
      ? design.termsLines
      : ["Valid until the expiration date stated on this voucher."]
  ).slice(0, 6);

  const backCard = (
    <div
      className="relative aspect-[1200/760] w-full overflow-hidden rounded-xl shadow-[0_18px_50px_rgba(0,0,0,0.45)] select-none"
      style={{ backgroundColor: design.surfaceColor, containerType: "inline-size" }}
    >
      {design.backBackgroundUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={design.backBackgroundUrl}
            alt="Voucher back background"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{ backgroundColor: `${design.surfaceColor}d6` }}
          />
        </>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${design.accentColor}24 0%, ${design.surfaceColor} 65%)`,
          }}
        />
      )}

      {design.showBorderFrame ? (
        <>
          <div
            className="pointer-events-none absolute inset-[2.8%] rounded-[4px]"
            style={{ border: `1px solid ${design.accentColor}8c` }}
          />
          <div
            className="pointer-events-none absolute inset-[3.8%] rounded-[2px]"
            style={{ border: `1px solid ${design.accentColor}40` }}
          />
        </>
      ) : null}

      <div className="relative flex h-full flex-col justify-between p-[6.6%]">
        <div>
          <div
            className="flex items-center justify-between pb-[1.6cqw]"
            style={{ borderBottom: `1px solid ${design.accentColor}4d` }}
          >
            <div>
              <p
                className="uppercase"
                style={{
                  color: design.accentColor,
                  fontSize: "1.55cqw",
                  letterSpacing: "0.22em",
                }}
              >
                {design.backTitle}
              </p>
              {design.frontBrandLine ? (
                <p
                  className="mt-[0.4cqw] uppercase text-stone-400"
                  style={{ fontSize: "1.15cqw", letterSpacing: "0.16em" }}
                >
                  {design.frontBrandLine}
                </p>
              ) : null}
            </div>
            <p className="font-serif font-semibold text-[#fbf8f3]" style={{ fontSize: "2.8cqw" }}>
              {formatVoucherAmount(denominationCzk)}
            </p>
          </div>

          <div
            className="mt-[2cqw] flex items-center justify-between rounded-[1cqw] px-[1.9cqw] py-[1.3cqw]"
            style={{
              backgroundColor: `${design.accentColor}14`,
              border: `1px solid ${design.accentColor}47`,
            }}
          >
            <div>
              <p
                className="uppercase"
                style={{
                  color: `${design.accentColor}d9`,
                  fontSize: "0.95cqw",
                  letterSpacing: "0.18em",
                }}
              >
                VOUCHER CODE
              </p>
              <p
                className="mt-[0.3cqw] font-mono font-bold text-[#fbf8f3]"
                style={{ fontSize: "1.65cqw", letterSpacing: "0.1em" }}
              >
                {sampleCode}
              </p>
            </div>
            <div className="text-right">
              <p
                className="uppercase"
                style={{
                  color: `${design.accentColor}d9`,
                  fontSize: "0.95cqw",
                  letterSpacing: "0.18em",
                }}
              >
                VALID UNTIL
              </p>
              <p
                className="mt-[0.3cqw] font-bold"
                style={{ color: design.accentColor, fontSize: "1.65cqw" }}
              >
                {expiryLabel}
              </p>
            </div>
          </div>

          <ul className="mt-[2cqw] space-y-[0.95cqw]">
            {terms.map((line, i) => (
              <li key={i} className="flex items-start gap-[1.1cqw]">
                <span
                  className="mt-[0.6cqw] h-[0.5cqw] w-[0.5cqw] shrink-0 rounded-full"
                  style={{ backgroundColor: design.accentColor }}
                />
                <span
                  className="leading-snug text-[#e7e2da]"
                  style={{ fontSize: "1.35cqw" }}
                >
                  {line}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div
          className="flex flex-wrap items-start justify-between gap-[1.5cqw] pt-[1.5cqw]"
          style={{ borderTop: `1px solid ${design.accentColor}47` }}
        >
          {venueItems.length > 0 ? (
            venueItems.map((item, idx) => (
              <div key={idx} className="min-w-0 max-w-[28%]">
                <p
                  className="uppercase"
                  style={{
                    color: `${design.accentColor}cc`,
                    fontSize: "0.85cqw",
                    letterSpacing: "0.18em",
                  }}
                >
                  {item.label}
                </p>
                <p
                  className="mt-[0.3cqw] truncate text-[#f5efe6]"
                  style={{ fontSize: "1.18cqw" }}
                >
                  {item.value}
                </p>
              </div>
            ))
          ) : (
            <p className="text-stone-400" style={{ fontSize: "1.18cqw" }}>
              Add venue address, phone, email &amp; website below to display here.
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {(side === "front" || side === "both") && (
        <div className="space-y-1.5">
          {frontCard}
          <p className="text-center text-[10px] font-medium uppercase tracking-[0.28em] text-stone-400">
            VOUCHER PREVIEW · FRONT
          </p>
        </div>
      )}
      {(side === "back" || side === "both") && (
        <div className="space-y-1.5">
          {backCard}
          <p className="text-center text-[10px] font-medium uppercase tracking-[0.28em] text-stone-400">
            VOUCHER PREVIEW · BACK
          </p>
        </div>
      )}
    </div>
  );
}
