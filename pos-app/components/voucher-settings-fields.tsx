"use client";

import { useEffect, useState } from "react";
import { FileText, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { VoucherCardPreview } from "@/components/voucher-card-preview";
import {
  DEFAULT_VOUCHER_CONFIG,
  DEFAULT_VOUCHER_DESIGN,
  formatVoucherAmount,
  getResolvedVoucherDesign,
  type VoucherCardDesign,
  type VoucherConfig,
} from "@/lib/voucher";
import { uploadVoucherDesignAsset } from "@/lib/voucher-upload";

type Props = {
  value: VoucherConfig;
  onChange: (next: VoucherConfig) => void;
  /** Optional labels — falls back to English when omitted (admin CMS). */
  labels?: Partial<Record<string, string>>;
};

function L(labels: Props["labels"], key: string, fallback: string) {
  return labels?.[key] ?? fallback;
}

const DESIGN_PRESETS: Array<{ label: string; accentColor: string; surfaceColor: string }> = [
  { label: "Classic Gold", accentColor: "#C9A88B", surfaceColor: "#0b0a09" },
  { label: "Bright Gold", accentColor: "#D4AF37", surfaceColor: "#110d0a" },
  { label: "Imperial Crimson", accentColor: "#E09F7D", surfaceColor: "#180909" },
  { label: "Slate Ivory", accentColor: "#E5E0D8", surfaceColor: "#111317" },
];

export function VoucherSettingsFields({ value, onChange, labels }: Props) {
  const design = getResolvedVoucherDesign(value);
  const [densText, setDensText] = useState(value.denominationsCzk.join(", "));
  const [termsText, setTermsText] = useState(design.termsLines.join("\n"));
  const [previewSide, setPreviewSide] = useState<"front" | "back" | "both">("front");
  const [previewAmount, setPreviewAmount] = useState<number>(
    value.denominationsCzk[value.denominationsCzk.length - 1] ?? 5000,
  );
  const [uploadingRole, setUploadingRole] = useState<"front-bg" | "back-bg" | "logo" | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    setDensText(value.denominationsCzk.join(", "));
    if (!value.denominationsCzk.includes(previewAmount)) {
      setPreviewAmount(value.denominationsCzk[value.denominationsCzk.length - 1] ?? 5000);
    }
  }, [value.denominationsCzk, previewAmount]);

  useEffect(() => {
    const incoming = design.termsLines.join("\n");
    setTermsText((prev) => {
      const prevNorm = prev
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .join("\n");
      return prevNorm === incoming ? prev : incoming;
    });
  }, [design.termsLines]);

  const updateDesign = (patch: Partial<VoucherCardDesign>) => {
    onChange({
      ...value,
      design: {
        ...design,
        ...patch,
      },
    });
  };

  const handleAssetUpload = async (
    file: File | null | undefined,
    role: "front-bg" | "back-bg" | "logo",
  ) => {
    if (!file || uploadingRole) return;
    setUploadError(null);
    setUploadingRole(role);
    try {
      const res = await uploadVoucherDesignAsset(file, role);
      if (res.error || !res.publicUrl) {
        setUploadError(res.error || "Image upload failed.");
        return;
      }
      if (role === "front-bg") updateDesign({ frontBackgroundUrl: res.publicUrl });
      else if (role === "back-bg") updateDesign({ backBackgroundUrl: res.publicUrl });
      else updateDesign({ logoUrl: res.publicUrl, showLogo: true });
    } catch {
      setUploadError("Image upload failed.");
    } finally {
      setUploadingRole(null);
    }
  };

  const downloadSamplePdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    setUploadError(null);
    try {
      const response = await fetch("/api/vouchers/staff/preview-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: value, denominationCzk: previewAmount }),
      });
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as { error?: string };
        setUploadError(err.error || "Could not generate sample PDF.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Voucher-Preview-${previewAmount}CZK.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setUploadError("Could not generate sample PDF.");
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Sales & Bank Details */}
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
          />
          {L(labels, "enabled", "Enable voucher sales on /voucher")}
        </label>

        <label className="block text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            {L(labels, "denominations", "Denominations (CZK, comma-separated)")}
          </span>
          <input
            value={densText}
            onChange={(e) => setDensText(e.target.value)}
            onBlur={() => {
              const parsed = densText
                .split(/[,;\s]+/)
                .map((n) => Math.round(Number(n)))
                .filter((n) => Number.isFinite(n) && n > 0);
              const next =
                parsed.length > 0 ? parsed : [...DEFAULT_VOUCHER_CONFIG.denominationsCzk];
              setDensText(next.join(", "));
              onChange({ ...value, denominationsCzk: next });
            }}
            className="pos-input mt-1"
            placeholder="1000, 2000, 3000, 5000"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-gray-500 dark:text-gray-400">
              {L(labels, "accountHolder", "Account holder")}
            </span>
            <input
              value={value.accountHolder}
              onChange={(e) => onChange({ ...value, accountHolder: e.target.value })}
              className="pos-input mt-1"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-500 dark:text-gray-400">
              {L(labels, "accountNumber", "Account number")}
            </span>
            <input
              value={value.accountNumber}
              onChange={(e) => onChange({ ...value, accountNumber: e.target.value })}
              className="pos-input mt-1"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-500 dark:text-gray-400">
              {L(labels, "iban", "IBAN (required for Czech QR)")}
            </span>
            <input
              value={value.iban}
              onChange={(e) => onChange({ ...value, iban: e.target.value })}
              className="pos-input mt-1"
              placeholder="CZ65…"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-500 dark:text-gray-400">
              {L(labels, "bankName", "Bank name")}
            </span>
            <input
              value={value.bankName}
              onChange={(e) => onChange({ ...value, bankName: e.target.value })}
              className="pos-input mt-1"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-500 dark:text-gray-400">
              {L(labels, "bicSwift", "BIC / SWIFT")}
            </span>
            <input
              value={value.bicSwift}
              onChange={(e) => onChange({ ...value, bicSwift: e.target.value })}
              className="pos-input mt-1"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-500 dark:text-gray-400">
              {L(labels, "validityDays", "Validity after issue (days, 0 = none)")}
            </span>
            <input
              type="number"
              min={0}
              max={3650}
              value={value.validityDays}
              onChange={(e) =>
                onChange({
                  ...value,
                  validityDays: Math.min(3650, Math.max(0, Number(e.target.value) || 0)),
                })
              }
              className="pos-input mt-1"
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            {L(labels, "bankPaymentNote", "Extra bank payment note (shown to guests)")}
          </span>
          <textarea
            rows={2}
            value={value.bankPaymentNote}
            onChange={(e) => onChange({ ...value, bankPaymentNote: e.target.value })}
            className="pos-input mt-1"
          />
        </label>

        <label className="block text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            {L(labels, "processingMessage", "Processing / confirmation message")}
          </span>
          <textarea
            rows={3}
            value={value.processingMessage}
            onChange={(e) => onChange({ ...value, processingMessage: e.target.value })}
            className="pos-input mt-1"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-gray-500 dark:text-gray-400">
              {L(labels, "confirmationEmailSubject", "Order confirmation email subject")}
            </span>
            <input
              value={value.confirmationEmailSubject}
              onChange={(e) => onChange({ ...value, confirmationEmailSubject: e.target.value })}
              className="pos-input mt-1"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-500 dark:text-gray-400">
              {L(labels, "issuedEmailSubject", "Issued voucher email subject")}
            </span>
            <input
              value={value.issuedEmailSubject}
              onChange={(e) => onChange({ ...value, issuedEmailSubject: e.target.value })}
              className="pos-input mt-1"
            />
          </label>
        </div>
      </div>

      {/* Voucher Card Designer (2-sided Card + PDF) */}
      <div className="border-t border-gray-200 pt-6 dark:border-gray-700">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Gift Voucher Card Design (2-Sided Card &amp; PDF)
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Customize the front photo, denomination look, QR badge, back terms (English), expiry, and venue details. Used to render the email preview and downloadable 2-sided PDF.
          </p>
        </div>

        {uploadError ? (
          <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {uploadError}
          </p>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1fr_440px]">
          {/* Controls Column */}
          <div className="space-y-5">
            {/* Images & Logo Uploads */}
            <div className="grid gap-3 sm:grid-cols-3">
              {/* Front Background */}
              <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                  Front Photo
                </p>
                {design.frontBackgroundUrl ? (
                  <div className="relative mt-2 aspect-[16/10] overflow-hidden rounded-lg bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={design.frontBackgroundUrl}
                      alt="Front background"
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-gray-400">No photo uploaded</p>
                )}
                <div className="mt-2.5 flex items-center gap-1.5">
                  <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700">
                    {uploadingRole === "front-bg" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ImagePlus className="h-3.5 w-3.5" />
                    )}
                    <span>{design.frontBackgroundUrl ? "Change" : "Upload"}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        void handleAssetUpload(e.target.files?.[0], "front-bg");
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {design.frontBackgroundUrl ? (
                    <button
                      type="button"
                      onClick={() => updateDesign({ frontBackgroundUrl: "" })}
                      className="rounded-lg border border-gray-300 p-1.5 text-gray-500 hover:text-rose-600 dark:border-gray-600"
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Back Background (optional) */}
              <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                  Back Photo (Optional)
                </p>
                {design.backBackgroundUrl ? (
                  <div className="relative mt-2 aspect-[16/10] overflow-hidden rounded-lg bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={design.backBackgroundUrl}
                      alt="Back background"
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-gray-400">Uses dark luxury base</p>
                )}
                <div className="mt-2.5 flex items-center gap-1.5">
                  <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700">
                    {uploadingRole === "back-bg" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ImagePlus className="h-3.5 w-3.5" />
                    )}
                    <span>{design.backBackgroundUrl ? "Change" : "Upload"}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        void handleAssetUpload(e.target.files?.[0], "back-bg");
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {design.backBackgroundUrl ? (
                    <button
                      type="button"
                      onClick={() => updateDesign({ backBackgroundUrl: "" })}
                      className="rounded-lg border border-gray-300 p-1.5 text-gray-500 hover:text-rose-600 dark:border-gray-600"
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Custom Logo */}
              <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                  Card Emblem / Logo
                </p>
                {design.logoUrl ? (
                  <div className="relative mt-2 flex aspect-[16/10] items-center justify-center overflow-hidden rounded-lg bg-zinc-900 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={design.logoUrl}
                      alt="Voucher logo"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-gray-400">Uses monogram or POS logo</p>
                )}
                <div className="mt-2.5 flex items-center gap-1.5">
                  <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700">
                    {uploadingRole === "logo" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ImagePlus className="h-3.5 w-3.5" />
                    )}
                    <span>{design.logoUrl ? "Change" : "Upload"}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        void handleAssetUpload(e.target.files?.[0], "logo");
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {design.logoUrl ? (
                    <button
                      type="button"
                      onClick={() => updateDesign({ logoUrl: "" })}
                      className="rounded-lg border border-gray-300 p-1.5 text-gray-500 hover:text-rose-600 dark:border-gray-600"
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Style Controls */}
            <div className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Theme &amp; Colors
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {DESIGN_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        updateDesign({
                          accentColor: preset.accentColor,
                          surfaceColor: preset.surfaceColor,
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: preset.accentColor }}
                      />
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="color"
                    value={design.accentColor}
                    onChange={(e) => updateDesign({ accentColor: e.target.value })}
                    className="h-8 w-10 cursor-pointer rounded border border-gray-300 bg-transparent p-0.5 dark:border-gray-600"
                  />
                  <span className="text-gray-600 dark:text-gray-300">Accent Gold</span>
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="color"
                    value={design.surfaceColor}
                    onChange={(e) => updateDesign({ surfaceColor: e.target.value })}
                    className="h-8 w-10 cursor-pointer rounded border border-gray-300 bg-transparent p-0.5 dark:border-gray-600"
                  />
                  <span className="text-gray-600 dark:text-gray-300">Card Base</span>
                </label>
                <label className="block text-xs">
                  <span className="text-gray-600 dark:text-gray-300">
                    Photo Dark Overlay ({design.frontOverlayOpacity}%)
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={90}
                    value={design.frontOverlayOpacity}
                    onChange={(e) =>
                      updateDesign({ frontOverlayOpacity: Number(e.target.value) })
                    }
                    className="mt-1.5 w-full"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-5 pt-1 text-xs text-gray-700 dark:text-gray-200">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={design.showLogo}
                    onChange={(e) => updateDesign({ showLogo: e.target.checked })}
                  />
                  Show logo badge
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={design.showBorderFrame}
                    onChange={(e) => updateDesign({ showBorderFrame: e.target.checked })}
                  />
                  Show double border frame
                </label>
              </div>
            </div>

            {/* Front Text Controls */}
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs">
                <span className="text-gray-500 dark:text-gray-400">Front Title</span>
                <input
                  value={design.frontTitle}
                  onChange={(e) => updateDesign({ frontTitle: e.target.value })}
                  className="pos-input mt-1 text-sm"
                  placeholder={DEFAULT_VOUCHER_DESIGN.frontTitle}
                />
              </label>
              <label className="block text-xs">
                <span className="text-gray-500 dark:text-gray-400">Brand · City Line</span>
                <input
                  value={design.frontBrandLine}
                  onChange={(e) => updateDesign({ frontBrandLine: e.target.value })}
                  className="pos-input mt-1 text-sm"
                  placeholder={DEFAULT_VOUCHER_DESIGN.frontBrandLine}
                />
              </label>
              <label className="block text-xs">
                <span className="text-gray-500 dark:text-gray-400">Subtitle</span>
                <input
                  value={design.frontSubtitle}
                  onChange={(e) => updateDesign({ frontSubtitle: e.target.value })}
                  className="pos-input mt-1 text-sm"
                  placeholder="Korean BBQ & Culinary Experience"
                />
              </label>
            </div>

            {/* Back Text & Venue Controls */}
            <div className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs">
                  <span className="text-gray-500 dark:text-gray-400">Back Side Heading</span>
                  <input
                    value={design.backTitle}
                    onChange={(e) => updateDesign({ backTitle: e.target.value })}
                    className="pos-input mt-1 text-sm"
                    placeholder={DEFAULT_VOUCHER_DESIGN.backTitle}
                  />
                </label>
                <label className="block text-xs">
                  <span className="text-gray-500 dark:text-gray-400">Website</span>
                  <input
                    value={design.venueWebsite}
                    onChange={(e) => updateDesign({ venueWebsite: e.target.value })}
                    className="pos-input mt-1 text-sm"
                    placeholder="seoulprague.com"
                  />
                </label>
                <label className="block text-xs">
                  <span className="text-gray-500 dark:text-gray-400">Address</span>
                  <input
                    value={design.venueAddress}
                    onChange={(e) => updateDesign({ venueAddress: e.target.value })}
                    className="pos-input mt-1 text-sm"
                    placeholder="Leave blank to use website address"
                  />
                </label>
                <label className="block text-xs">
                  <span className="text-gray-500 dark:text-gray-400">Phone</span>
                  <input
                    value={design.venuePhone}
                    onChange={(e) => updateDesign({ venuePhone: e.target.value })}
                    className="pos-input mt-1 text-sm"
                    placeholder="+420 …"
                  />
                </label>
                <label className="block text-xs sm:col-span-2">
                  <span className="text-gray-500 dark:text-gray-400">Contact Email</span>
                  <input
                    value={design.venueEmail}
                    onChange={(e) => updateDesign({ venueEmail: e.target.value })}
                    className="pos-input mt-1 text-sm"
                    placeholder="info@seoulprague.com"
                  />
                </label>
              </div>

              <label className="block text-xs">
                <span className="text-gray-500 dark:text-gray-400">
                  Terms &amp; Conditions (English, one bullet per line — max 6)
                </span>
                <textarea
                  rows={4}
                  value={termsText}
                  onChange={(e) => {
                    const next = e.target.value;
                    setTermsText(next);
                    const lines = next
                      .split("\n")
                      .map((l) => l.trim())
                      .filter(Boolean)
                      .slice(0, 6);
                    updateDesign({ termsLines: lines });
                  }}
                  className="pos-input mt-1 text-sm leading-relaxed"
                />
              </label>
            </div>
          </div>

          {/* Live Preview Column */}
          <div className="space-y-3 xl:sticky xl:top-4 xl:self-start">
            <div className="rounded-2xl border border-gray-200 bg-zinc-950 p-4 dark:border-gray-700">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5 text-xs">
                  {(["front", "back", "both"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPreviewSide(mode)}
                      className={`rounded-md px-2.5 py-1 capitalize transition ${
                        previewSide === mode
                          ? "bg-[#C9A88B] font-semibold text-zinc-950"
                          : "text-zinc-300 hover:text-white"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-1">
                  {value.denominationsCzk.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setPreviewAmount(amt)}
                      className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                        previewAmount === amt
                          ? "bg-white/20 text-white"
                          : "bg-white/5 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {formatVoucherAmount(amt)}
                    </button>
                  ))}
                </div>
              </div>

              <VoucherCardPreview
                config={value}
                denominationCzk={previewAmount}
                side={previewSide}
              />

              <button
                type="button"
                disabled={pdfBusy}
                onClick={() => void downloadSamplePdf()}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#C9A88B]/40 bg-[#C9A88B]/15 py-2.5 text-xs font-semibold text-[#F5EDE4] transition hover:bg-[#C9A88B]/25 disabled:opacity-50"
              >
                {pdfBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
                <span>Download Sample 2-Sided PDF</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Standalone admin editor that loads/saves via staff API. */
export function AdminVoucherSettingsEditor() {
  const [config, setConfig] = useState<VoucherConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/vouchers/staff/config")
      .then(async (r) => {
        const payload = (await r.json()) as { config?: VoucherConfig; error?: string };
        if (!r.ok) throw new Error(payload.error || "Failed to load");
        if (!cancelled) setConfig(payload.config ?? { ...DEFAULT_VOUCHER_CONFIG });
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    if (!config || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/vouchers/staff/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const payload = (await response.json()) as { config?: VoucherConfig; error?: string };
      if (!response.ok) {
        setError(payload.error || "Save failed");
        return;
      }
      if (payload.config) setConfig(payload.config);
      setMessage("Voucher settings saved.");
    } catch {
      setError("Save failed");
    } finally {
      setBusy(false);
    }
  };

  if (!loaded && !config) {
    return <p className="text-sm text-gray-500">Loading voucher settings…</p>;
  }

  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <header>
        <h2 className="text-lg font-semibold">Voucher settings</h2>
        <p className="mt-1 text-sm text-gray-500">
          Bank details, Czech SPD QR (IBAN), denominations, card designer, and email copy for{" "}
          <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">/voucher</code>.
        </p>
      </header>
      {config ? <VoucherSettingsFields value={config} onChange={setConfig} /> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
      <button
        type="button"
        disabled={busy || !config}
        onClick={() => void save()}
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-gray-100 dark:text-gray-900"
      >
        {busy ? "Saving…" : "Save voucher settings"}
      </button>
    </div>
  );
}
