import { readFile } from "node:fs/promises";
import path from "node:path";
import { createElement, type ReactElement } from "react";
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import {
  formatVoucherAmount,
  getResolvedVoucherDesign,
  type VoucherCardDesign,
  type VoucherCode,
  type VoucherConfig,
  type VoucherOrder,
} from "@/lib/voucher";
import { buildPdfFromPngPages } from "@/src/lib/voucher-pdf";

export const VOUCHER_CARD_WIDTH = 1200;
export const VOUCHER_CARD_HEIGHT = 760;

type FontSet = {
  playfairRegular: Buffer;
  playfairSemiBold: Buffer;
  playfairItalic: Buffer;
  sansRegular: Buffer;
  sansBold: Buffer;
};

let cachedFonts: FontSet | null = null;

async function readFirstExisting(candidates: string[]): Promise<Buffer> {
  for (const filePath of candidates) {
    try {
      return await readFile(filePath);
    } catch {
      /* try next candidate */
    }
  }
  throw new Error(`Missing font asset: ${candidates.join(", ")}`);
}

async function loadFonts(): Promise<FontSet> {
  if (cachedFonts) return cachedFonts;
  const cwd = process.cwd();
  const [playfairRegular, playfairSemiBold, playfairItalic, sansRegular, sansBold] =
    await Promise.all([
      readFirstExisting([
        path.join(cwd, "app/fonts/playfair-display/static/PlayfairDisplay-Regular.ttf"),
        path.join(cwd, "pos-app/app/fonts/playfair-display/static/PlayfairDisplay-Regular.ttf"),
      ]),
      readFirstExisting([
        path.join(cwd, "app/fonts/playfair-display/static/PlayfairDisplay-SemiBold.ttf"),
        path.join(cwd, "pos-app/app/fonts/playfair-display/static/PlayfairDisplay-SemiBold.ttf"),
      ]),
      readFirstExisting([
        path.join(cwd, "app/fonts/playfair-display/static/PlayfairDisplay-Italic.ttf"),
        path.join(cwd, "pos-app/app/fonts/playfair-display/static/PlayfairDisplay-Italic.ttf"),
      ]),
      readFirstExisting([
        path.join(cwd, "app/fonts/playfair-display/static/PlusJakartaSans-Regular.ttf"),
        path.join(cwd, "pos-app/app/fonts/playfair-display/static/PlusJakartaSans-Regular.ttf"),
      ]),
      readFirstExisting([
        path.join(cwd, "app/fonts/playfair-display/static/PlusJakartaSans-Bold.ttf"),
        path.join(cwd, "pos-app/app/fonts/playfair-display/static/PlusJakartaSans-Bold.ttf"),
      ]),
    ]);
  cachedFonts = {
    playfairRegular,
    playfairSemiBold,
    playfairItalic,
    sansRegular,
    sansBold,
  };
  return cachedFonts;
}

function hexToRgbTuple(hex: string, fallback: readonly [number, number, number]): [number, number, number] {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return [...fallback];
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex: string, alpha: number, fallback: readonly [number, number, number] = [201, 168, 139]): string {
  const [r, g, b] = hexToRgbTuple(hex, fallback);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha)).toFixed(3)})`;
}

function splitAmountParts(czk: number): { num: string; currency: string } {
  const formatted = formatVoucherAmount(czk);
  const match = formatted.match(/^([\d\s\u00a0.,]+)\s*(.*)$/);
  if (!match) return { num: String(czk), currency: "Kč" };
  return {
    num: match[1].trim(),
    currency: match[2].trim() || "Kč",
  };
}

export function formatVoucherExpiryLabel(expiresAt?: string | null, validityDays = 365): string {
  if (expiresAt) {
    const d = new Date(expiresAt);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Prague",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(d);
    }
  }
  if (validityDays <= 0) return "No Expiration";
  return `${validityDays} days from issue`;
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

async function fetchImageAsDataUri(url: string): Promise<string | null> {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:image/")) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const res = await fetch(trimmed, {
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    // Satori decodes png/jpeg/gif/svg cleanly.
    if (!/image\/(png|jpe?g|gif|svg\+xml)/i.test(contentType)) {
      return null;
    }
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > 10 * 1024 * 1024) return null;
    return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}

export interface VoucherCardRenderInput {
  code: string;
  denominationCzk: number;
  expiresAt?: string | null;
  validityDays: number;
  design: VoucherCardDesign;
  qrDataUrl?: string;
}

function renderBorderFrames(design: VoucherCardDesign): ReactElement[] {
  if (!design.showBorderFrame) return [];
  return [
    createElement("div", {
      key: "frame-outer",
      style: {
        display: "flex",
        position: "absolute",
        top: 22,
        left: 22,
        right: 22,
        bottom: 22,
        border: `1.5px solid ${rgba(design.accentColor, 0.55)}`,
        borderRadius: 6,
      },
    }),
    createElement("div", {
      key: "frame-inner",
      style: {
        display: "flex",
        position: "absolute",
        top: 30,
        left: 30,
        right: 30,
        bottom: 30,
        border: `1px solid ${rgba(design.accentColor, 0.25)}`,
        borderRadius: 4,
      },
    }),
  ];
}

export async function renderVoucherFrontPng(input: VoucherCardRenderInput): Promise<Buffer> {
  const fonts = await loadFonts();
  const design = input.design;
  const qrDataUrl =
    input.qrDataUrl ||
    (await QRCode.toDataURL(input.code, {
      type: "image/png",
      width: 360,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#111111", light: "#ffffff" },
    }));

  const [bgDataUri, logoDataUri] = await Promise.all([
    fetchImageAsDataUri(design.frontBackgroundUrl),
    design.showLogo ? fetchImageAsDataUri(design.logoUrl) : Promise.resolve(null),
  ]);

  const opacity = Math.min(0.9, Math.max(0, design.frontOverlayOpacity / 100));
  const amount = splitAmountParts(input.denominationCzk);
  const monogram = monogramFromBrand(design.frontBrandLine);

  const root = createElement(
    "div",
    {
      style: {
        display: "flex",
        position: "relative",
        width: VOUCHER_CARD_WIDTH,
        height: VOUCHER_CARD_HEIGHT,
        backgroundColor: design.surfaceColor,
        overflow: "hidden",
        flexDirection: "column",
        justifyContent: "space-between",
        fontFamily: "Plus Jakarta Sans",
      },
    },
    // Background photo or subtle radial luxury base
    bgDataUri
      ? createElement("img", {
          src: bgDataUri,
          width: VOUCHER_CARD_WIDTH,
          height: VOUCHER_CARD_HEIGHT,
          style: {
            position: "absolute",
            top: 0,
            left: 0,
            width: VOUCHER_CARD_WIDTH,
            height: VOUCHER_CARD_HEIGHT,
            objectFit: "cover",
          },
        })
      : createElement("div", {
          style: {
            display: "flex",
            position: "absolute",
            top: 0,
            left: 0,
            width: VOUCHER_CARD_WIDTH,
            height: VOUCHER_CARD_HEIGHT,
            backgroundImage: `radial-gradient(circle at 65% 35%, ${rgba(design.accentColor, 0.2)}, ${design.surfaceColor} 72%)`,
          },
        }),
    // Moody dark gradient overlay so typography & QR remain crystal clear
    createElement("div", {
      style: {
        display: "flex",
        position: "absolute",
        top: 0,
        left: 0,
        width: VOUCHER_CARD_WIDTH,
        height: VOUCHER_CARD_HEIGHT,
        backgroundImage: `linear-gradient(125deg, ${rgba(design.surfaceColor, opacity * 0.92, [11, 10, 9])} 0%, ${rgba(design.surfaceColor, opacity * 0.48, [11, 10, 9])} 48%, ${rgba(design.surfaceColor, opacity * 0.85, [11, 10, 9])} 100%)`,
      },
    }),
    createElement("div", {
      style: {
        display: "flex",
        position: "absolute",
        top: 0,
        left: 0,
        width: VOUCHER_CARD_WIDTH,
        height: VOUCHER_CARD_HEIGHT,
        backgroundImage: `linear-gradient(180deg, ${rgba(design.surfaceColor, opacity * 0.45, [11, 10, 9])} 0%, rgba(0,0,0,0) 40%, ${rgba(design.surfaceColor, Math.min(0.95, opacity + 0.16), [11, 10, 9])} 100%)`,
      },
    }),
    ...renderBorderFrames(design),
    // Top Header Row (Left: Titles, Right: Compact Logo Emblem)
    createElement(
      "div",
      {
        style: {
          display: "flex",
          position: "relative",
          padding: "52px 64px 0 64px",
          justifyContent: "space-between",
          alignItems: "flex-start",
          width: "100%",
        },
      },
      createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", maxWidth: 740 } },
        createElement(
          "div",
          {
            style: {
              display: "flex",
              fontSize: 18,
              letterSpacing: "0.26em",
              color: design.accentColor,
              textTransform: "uppercase",
            },
          },
          design.frontTitle,
        ),
        design.frontBrandLine
          ? createElement(
              "div",
              {
                style: {
                  display: "flex",
                  marginTop: 10,
                  fontSize: 22,
                  letterSpacing: "0.18em",
                  color: "#f5efe6",
                  textTransform: "uppercase",
                },
              },
              design.frontBrandLine,
            )
          : null,
        design.frontSubtitle
          ? createElement(
              "div",
              {
                style: {
                  display: "flex",
                  marginTop: 8,
                  fontSize: 15,
                  letterSpacing: "0.08em",
                  color: rgba(design.accentColor, 0.78),
                },
              },
              design.frontSubtitle,
            )
          : null,
      ),
      design.showLogo
        ? createElement(
            "div",
            {
              style: {
                display: "flex",
                width: 78,
                height: 78,
                borderRadius: 999,
                border: `1.5px solid ${rgba(design.accentColor, 0.6)}`,
                backgroundColor: rgba(design.surfaceColor, 0.65, [11, 10, 9]),
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              },
            },
            logoDataUri
              ? createElement("img", {
                  src: logoDataUri,
                  width: 58,
                  height: 58,
                  style: { objectFit: "contain" },
                })
              : createElement(
                  "div",
                  {
                    style: {
                      display: "flex",
                      fontFamily: "Playfair Display",
                      fontSize: 26,
                      color: design.accentColor,
                      letterSpacing: "0.06em",
                    },
                  },
                  monogram,
                ),
          )
        : createElement("div", { style: { display: "flex" } }),
    ),
    // Bottom Row: Left = Value + Gold Line, Right = Large Scan-Friendly QR Card (nearly half card height)
    createElement(
      "div",
      {
        style: {
          display: "flex",
          position: "relative",
          padding: "0 64px 52px 64px",
          justifyContent: "space-between",
          alignItems: "flex-end",
          width: "100%",
        },
      },
      // Denomination block
      createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", maxWidth: 620 } },
        createElement(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              marginBottom: 14,
            },
          },
          createElement("div", {
            style: {
              display: "flex",
              width: 72,
              height: 1.5,
              backgroundColor: rgba(design.accentColor, 0.75),
            },
          }),
          createElement("div", {
            style: {
              display: "flex",
              width: 7,
              height: 7,
              backgroundColor: design.accentColor,
              transform: "rotate(45deg)",
              marginLeft: 8,
              marginRight: 8,
            },
          }),
          createElement("div", {
            style: {
              display: "flex",
              width: 150,
              height: 1,
              backgroundColor: rgba(design.accentColor, 0.45),
            },
          }),
        ),
        createElement(
          "div",
          { style: { display: "flex", alignItems: "baseline" } },
          createElement(
            "div",
            {
              style: {
                display: "flex",
                fontFamily: "Playfair Display",
                fontWeight: 600,
                fontSize: 94,
                lineHeight: 0.95,
                color: "#fbf8f3",
                letterSpacing: "-0.01em",
              },
            },
            amount.num,
          ),
          createElement(
            "div",
            {
              style: {
                display: "flex",
                fontFamily: "Playfair Display",
                fontStyle: "italic",
                fontSize: 48,
                color: design.accentColor,
                marginLeft: 14,
              },
            },
            amount.currency,
          ),
        ),
      ),
      // Oversized Front QR Box (~285px QR = ~46% of card height, ultra-scannable)
      createElement(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            backgroundColor: "#ffffff",
            borderRadius: 20,
            padding: "18px 20px 14px 20px",
            border: `2px solid ${rgba(design.accentColor, 0.9)}`,
          },
        },
        createElement("img", {
          src: qrDataUrl,
          width: 285,
          height: 285,
          style: { display: "flex", borderRadius: 8 },
        }),
        createElement(
          "div",
          {
            style: {
              display: "flex",
              marginTop: 10,
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "#1c1917",
            },
          },
          input.code,
        ),
      ),
    ),
  );

  const res = new ImageResponse(root, {
    width: VOUCHER_CARD_WIDTH,
    height: VOUCHER_CARD_HEIGHT,
    fonts: [
      { name: "Playfair Display", data: fonts.playfairRegular, weight: 400, style: "normal" },
      { name: "Playfair Display", data: fonts.playfairSemiBold, weight: 600, style: "normal" },
      { name: "Playfair Display", data: fonts.playfairItalic, weight: 400, style: "italic" },
      { name: "Plus Jakarta Sans", data: fonts.sansRegular, weight: 400, style: "normal" },
      { name: "Plus Jakarta Sans", data: fonts.sansBold, weight: 700, style: "normal" },
    ],
  });
  return Buffer.from(await res.arrayBuffer());
}

export async function renderVoucherBackPng(input: VoucherCardRenderInput): Promise<Buffer> {
  const fonts = await loadFonts();
  const design = input.design;
  const bgDataUri = design.backBackgroundUrl
    ? await fetchImageAsDataUri(design.backBackgroundUrl)
    : null;

  const expiryLabel = formatVoucherExpiryLabel(input.expiresAt, input.validityDays);
  const amountText = formatVoucherAmount(input.denominationCzk);
  const terms = (design.termsLines.length > 0 ? design.termsLines : ["Valid until the expiration date stated on this voucher."]).slice(0, 6);

  const venueItems: Array<{ label: string; value: string }> = [];
  if (design.venueAddress) venueItems.push({ label: "ADDRESS", value: design.venueAddress });
  if (design.venuePhone) venueItems.push({ label: "PHONE", value: design.venuePhone });
  if (design.venueEmail) venueItems.push({ label: "EMAIL", value: design.venueEmail });
  if (design.venueWebsite) venueItems.push({ label: "WEBSITE", value: design.venueWebsite });

  const root = createElement(
    "div",
    {
      style: {
        display: "flex",
        position: "relative",
        width: VOUCHER_CARD_WIDTH,
        height: VOUCHER_CARD_HEIGHT,
        backgroundColor: design.surfaceColor,
        overflow: "hidden",
        flexDirection: "column",
        justifyContent: "space-between",
        fontFamily: "Plus Jakarta Sans",
      },
    },
    bgDataUri
      ? createElement("img", {
          src: bgDataUri,
          width: VOUCHER_CARD_WIDTH,
          height: VOUCHER_CARD_HEIGHT,
          style: {
            position: "absolute",
            top: 0,
            left: 0,
            width: VOUCHER_CARD_WIDTH,
            height: VOUCHER_CARD_HEIGHT,
            objectFit: "cover",
          },
        })
      : createElement("div", {
          style: {
            display: "flex",
            position: "absolute",
            top: 0,
            left: 0,
            width: VOUCHER_CARD_WIDTH,
            height: VOUCHER_CARD_HEIGHT,
            backgroundImage: `linear-gradient(135deg, ${rgba(design.accentColor, 0.14)} 0%, ${design.surfaceColor} 65%)`,
          },
        }),
    bgDataUri
      ? createElement("div", {
          style: {
            display: "flex",
            position: "absolute",
            top: 0,
            left: 0,
            width: VOUCHER_CARD_WIDTH,
            height: VOUCHER_CARD_HEIGHT,
            backgroundColor: rgba(design.surfaceColor, 0.84, [11, 10, 9]),
          },
        })
      : null,
    ...renderBorderFrames(design),
    // Top section: Header + Key Info Strip
    createElement(
      "div",
      {
        style: {
          display: "flex",
          position: "relative",
          flexDirection: "column",
          padding: "54px 68px 0 68px",
          width: "100%",
        },
      },
      // Header row
      createElement(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingBottom: 20,
            borderBottom: `1px solid ${rgba(design.accentColor, 0.3)}`,
          },
        },
        createElement(
          "div",
          { style: { display: "flex", flexDirection: "column" } },
          createElement(
            "div",
            {
              style: {
                display: "flex",
                fontSize: 18,
                letterSpacing: "0.24em",
                color: design.accentColor,
                textTransform: "uppercase",
              },
            },
            design.backTitle,
          ),
          design.frontBrandLine
            ? createElement(
                "div",
                {
                  style: {
                    display: "flex",
                    marginTop: 6,
                    fontSize: 14,
                    letterSpacing: "0.16em",
                    color: "#a8a29e",
                    textTransform: "uppercase",
                  },
                },
                design.frontBrandLine,
              )
            : null,
        ),
        createElement(
          "div",
          {
            style: {
              display: "flex",
              fontFamily: "Playfair Display",
              fontWeight: 600,
              fontSize: 34,
              color: "#fbf8f3",
            },
          },
          amountText,
        ),
      ),
      // Key Metadata Row: Code | Valid Until
      createElement(
        "div",
        {
          style: {
            display: "flex",
            marginTop: 24,
            padding: "16px 22px",
            borderRadius: 12,
            backgroundColor: rgba(design.accentColor, 0.08),
            border: `1px solid ${rgba(design.accentColor, 0.28)}`,
            justifyContent: "space-between",
            alignItems: "center",
          },
        },
        createElement(
          "div",
          { style: { display: "flex", flexDirection: "column" } },
          createElement(
            "div",
            {
              style: {
                display: "flex",
                fontSize: 11,
                letterSpacing: "0.18em",
                color: rgba(design.accentColor, 0.85),
                textTransform: "uppercase",
              },
            },
            "VOUCHER CODE",
          ),
          createElement(
            "div",
            {
              style: {
                display: "flex",
                marginTop: 4,
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: "0.1em",
                color: "#fbf8f3",
              },
            },
            input.code,
          ),
        ),
        createElement(
          "div",
          { style: { display: "flex", flexDirection: "column", alignItems: "flex-end" } },
          createElement(
            "div",
            {
              style: {
                display: "flex",
                fontSize: 11,
                letterSpacing: "0.18em",
                color: rgba(design.accentColor, 0.85),
                textTransform: "uppercase",
              },
            },
            "VALID UNTIL",
          ),
          createElement(
            "div",
            {
              style: {
                display: "flex",
                marginTop: 4,
                fontSize: 20,
                fontWeight: 700,
                color: design.accentColor,
              },
            },
            expiryLabel,
          ),
        ),
      ),
      // Terms & Conditions bullets
      createElement(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            marginTop: 26,
          },
        },
        ...terms.map((line, i) =>
          createElement(
            "div",
            {
              key: `term-${i}`,
              style: {
                display: "flex",
                alignItems: "flex-start",
                marginBottom: 12,
              },
            },
            createElement("div", {
              style: {
                display: "flex",
                width: 6,
                height: 6,
                borderRadius: 999,
                backgroundColor: design.accentColor,
                marginTop: 8,
                marginRight: 14,
                flexShrink: 0,
              },
            }),
            createElement(
              "div",
              {
                style: {
                  display: "flex",
                  fontSize: 16,
                  lineHeight: 1.45,
                  color: "#e7e2da",
                },
              },
              line,
            ),
          ),
        ),
      ),
    ),
    // Bottom Venue Info Strip
    createElement(
      "div",
      {
        style: {
          display: "flex",
          position: "relative",
          margin: "0 68px 50px 68px",
          paddingTop: 18,
          borderTop: `1px solid ${rgba(design.accentColor, 0.28)}`,
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 18,
        },
      },
      ...(venueItems.length > 0
        ? venueItems.map((item, idx) =>
            createElement(
              "div",
              {
                key: `venue-${idx}`,
                style: { display: "flex", flexDirection: "column", maxWidth: 320 },
              },
              createElement(
                "div",
                {
                  style: {
                    display: "flex",
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    color: rgba(design.accentColor, 0.8),
                  },
                },
                item.label,
              ),
              createElement(
                "div",
                {
                  style: {
                    display: "flex",
                    marginTop: 4,
                    fontSize: 14,
                    color: "#f5efe6",
                  },
                },
                item.value,
              ),
            ),
          )
        : [
            createElement(
              "div",
              {
                key: "venue-default",
                style: { display: "flex", fontSize: 14, color: "#a8a29e" },
              },
              "Thank you for dining with us. We look forward to welcoming you!",
            ),
          ]),
    ),
  );

  const res = new ImageResponse(root, {
    width: VOUCHER_CARD_WIDTH,
    height: VOUCHER_CARD_HEIGHT,
    fonts: [
      { name: "Playfair Display", data: fonts.playfairRegular, weight: 400, style: "normal" },
      { name: "Playfair Display", data: fonts.playfairSemiBold, weight: 600, style: "normal" },
      { name: "Playfair Display", data: fonts.playfairItalic, weight: 400, style: "italic" },
      { name: "Plus Jakarta Sans", data: fonts.sansRegular, weight: 400, style: "normal" },
      { name: "Plus Jakarta Sans", data: fonts.sansBold, weight: 700, style: "normal" },
    ],
  });
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Render Front & Back PNGs for each voucher code in an order and combine all sides into one
 * multi-page print-ready PDF (`Front 1, Back 1, Front 2, Back 2...`).
 */
export async function renderVoucherOrderAssets(input: {
  order: VoucherOrder;
  codes: VoucherCode[];
  config: VoucherConfig;
  designOverride?: VoucherCardDesign;
  skipPdf?: boolean;
}): Promise<{
  pdfBuffer: Buffer | null;
  vouchers: Array<{
    code: string;
    expiresAt?: string | null;
    frontPng: Buffer;
    backPng: Buffer;
    qrDataUrl: string;
  }>;
}> {
  const design = input.designOverride ?? getResolvedVoucherDesign(input.config);
  const rendered: Array<{
    code: string;
    expiresAt?: string | null;
    frontPng: Buffer;
    backPng: Buffer;
    qrDataUrl: string;
  }> = [];
  const pdfPages: Buffer[] = [];

  for (const codeRow of input.codes) {
    const qrDataUrl = await QRCode.toDataURL(codeRow.code, {
      type: "image/png",
      width: 440,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#111111", light: "#ffffff" },
    });

    const renderInput: VoucherCardRenderInput = {
      code: codeRow.code,
      denominationCzk: codeRow.denominationCzk || input.order.denominationCzk,
      expiresAt: codeRow.expiresAt ?? null,
      validityDays: input.config.validityDays,
      design,
      qrDataUrl,
    };

    const [frontPng, backPng] = await Promise.all([
      renderVoucherFrontPng(renderInput),
      renderVoucherBackPng(renderInput),
    ]);

    rendered.push({
      code: codeRow.code,
      expiresAt: codeRow.expiresAt ?? null,
      frontPng,
      backPng,
      qrDataUrl,
    });
    if (!input.skipPdf) {
      pdfPages.push(frontPng, backPng);
    }
  }

  const pdfBuffer = input.skipPdf
    ? null
    : buildPdfFromPngPages(pdfPages, {
        bgRgb: hexToRgbTuple(design.surfaceColor, [11, 10, 9]),
      });

  return { pdfBuffer, vouchers: rendered };
}
