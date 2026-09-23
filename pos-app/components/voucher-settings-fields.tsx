"use client";

import { useEffect, useState } from "react";
import type { VoucherConfig } from "@/lib/voucher";
import { DEFAULT_VOUCHER_CONFIG } from "@/lib/voucher";

type Props = {
  value: VoucherConfig;
  onChange: (next: VoucherConfig) => void;
  /** Optional labels — falls back to English when omitted (admin CMS). */
  labels?: Partial<Record<string, string>>;
};

function L(labels: Props["labels"], key: string, fallback: string) {
  return labels?.[key] ?? fallback;
}

export function VoucherSettingsFields({ value, onChange, labels }: Props) {
  const [densText, setDensText] = useState(value.denominationsCzk.join(", "));

  useEffect(() => {
    setDensText(value.denominationsCzk.join(", "));
  }, [value.denominationsCzk]);

  return (
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
          placeholder="1000, 2000, 5000"
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
          <span className="text-gray-500 dark:text-gray-400">{L(labels, "iban", "IBAN (required for Czech QR)")}</span>
          <input
            value={value.iban}
            onChange={(e) => onChange({ ...value, iban: e.target.value })}
            className="pos-input mt-1"
            placeholder="CZ65…"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-500 dark:text-gray-400">{L(labels, "bankName", "Bank name")}</span>
          <input
            value={value.bankName}
            onChange={(e) => onChange({ ...value, bankName: e.target.value })}
            className="pos-input mt-1"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-500 dark:text-gray-400">{L(labels, "bicSwift", "BIC / SWIFT")}</span>
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
          Bank details, Czech SPD QR (IBAN), denominations, and email copy for{" "}
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
