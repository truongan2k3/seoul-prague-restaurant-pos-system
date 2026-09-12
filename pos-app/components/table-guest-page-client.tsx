"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bell,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Flame,
  Globe2,
  Receipt,
  Soup,
  Star,
  X,
} from "lucide-react";
import { formatCzk } from "@/lib/currency";
import {
  detectGuestTableLang,
  guestTableCopy,
  GUEST_TABLE_LANGS,
  type GuestTableLang,
} from "@/lib/i18n/guest-table";
import {
  BANCHAN_OPTIONS,
  type BanchanOption,
  type TableGuestPaymentMethod,
  type TableGuestRequestKind,
} from "@/lib/table-guest";

type BillLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type Snapshot = {
  tableId: string;
  tableLabel: string;
  bill: { lines: BillLine[]; total: number };
  banchanOptions?: BanchanOption[];
  reviewUrl: string;
  websiteUrl: string;
};

type Panel = "bill" | "banchan" | "grill" | "payment" | null;

export function TableGuestPageClient({
  tableId,
  restaurantName,
  logoUrl,
}: {
  tableId: string;
  restaurantName: string;
  logoUrl?: string;
}) {
  const [lang, setLang] = useState<GuestTableLang>("en");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banchanQty, setBanchanQty] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<TableGuestPaymentMethod>("card");
  const [note, setNote] = useState("");

  const copy = useMemo(() => guestTableCopy(lang), [lang]);
  // Prefer snapshot list as-is (including empty = all toggled off in POS).
  const banchanOptions = snapshot?.banchanOptions ?? BANCHAN_OPTIONS;

  useEffect(() => {
    setLang(detectGuestTableLang());
  }, []);

  const load = useCallback(async () => {
    const response = await fetch(`/api/table-guest/${encodeURIComponent(tableId)}`, {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as {
      table?: Snapshot;
      error?: string;
    };
    if (!response.ok || !payload.table) {
      setSnapshot(null);
      setLoadError(payload.error || copy.tableUnavailable);
      return;
    }
    setLoadError(null);
    setSnapshot(payload.table);
  }, [copy.tableUnavailable, tableId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendRequest(
    kind: TableGuestRequestKind,
    extra?: { payload?: Record<string, unknown>; note?: string },
  ) {
    setSending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/table-guest/${encodeURIComponent(tableId)}/requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            payload: extra?.payload,
            note: extra?.note,
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error || copy.errorGeneric);
        return;
      }
      setFlash(copy.sent);
      setPanel(null);
      setNote("");
      setBanchanQty({});
      window.setTimeout(() => setFlash(null), 3500);
    } catch {
      setError(copy.errorGeneric);
    } finally {
      setSending(false);
    }
  }

  if (loadError && !snapshot) {
    return (
      <main className="landing-theme mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center bg-[#0B0B0C] px-6 text-center text-white">
        <p className="landing-serif text-2xl text-[#E8D5C4]">{restaurantName}</p>
        <p className="mt-4 text-sm text-white/70">{loadError}</p>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="landing-theme flex min-h-screen items-center justify-center bg-[#0B0B0C] text-white/60">
        …
      </main>
    );
  }

  const title = copy.tableTitle.replace("{label}", snapshot.tableLabel);

  return (
    <main className="landing-theme min-h-screen bg-[#0B0B0C] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(201,168,139,0.14),transparent_55%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-lg flex-col px-5 pb-10 pt-8">
        <header className="flex items-start justify-between gap-3">
          <div>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="mb-3 h-10 w-10 object-contain opacity-90" />
            ) : null}
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#C9A88B]">
              {restaurantName}
            </p>
            <h1 className="landing-serif mt-2 text-3xl leading-tight text-[#F5EDE4]">{title}</h1>
            <p className="mt-1 text-sm text-white/55">{copy.subtitle}</p>
          </div>
          <label className="shrink-0 text-right">
            <span className="block text-[10px] uppercase tracking-wide text-white/40">
              {copy.language}
            </span>
            <select
              value={lang}
              onChange={(event) => setLang(event.target.value as GuestTableLang)}
              className="mt-1 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white outline-none"
            >
              {GUEST_TABLE_LANGS.map((code) => (
                <option key={code} value={code} className="bg-[#0B0B0C]">
                  {code.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
        </header>

        {flash ? (
          <div className="mt-5 flex items-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {flash}
          </div>
        ) : null}
        {error ? (
          <div className="mt-5 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <section className="mt-6 grid gap-3">
          <ActionButton icon={<Receipt className="h-5 w-5" />} label={copy.currentBill} onClick={() => setPanel("bill")} />
          <ActionButton
            icon={<Bell className="h-5 w-5" />}
            label={copy.callStaff}
            disabled={sending}
            onClick={() => void sendRequest("call_staff")}
          />
          {banchanOptions.length > 0 ? (
            <ActionButton icon={<Soup className="h-5 w-5" />} label={copy.requestBanchan} onClick={() => setPanel("banchan")} />
          ) : null}
          <ActionButton icon={<Flame className="h-5 w-5" />} label={copy.requestGrill} onClick={() => setPanel("grill")} />
          <ActionButton
            icon={<CreditCard className="h-5 w-5" />}
            label={copy.requestPayment}
            onClick={() => setPanel("payment")}
          />
          <a
            href={snapshot.websiteUrl || "/"}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 transition hover:border-[#C9A88B]/40 hover:bg-white/[0.07]"
          >
            <Globe2 className="h-5 w-5 text-[#C9A88B]" />
            <span className="flex-1 text-sm font-medium">{copy.visitWebsite}</span>
            <ExternalLink className="h-4 w-4 text-white/35" />
          </a>
          <a
            href={snapshot.reviewUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 transition hover:border-[#C9A88B]/40 hover:bg-white/[0.07]"
          >
            <Star className="h-5 w-5 text-[#C9A88B]" />
            <span className="flex-1 text-sm font-medium">{copy.leaveReview}</span>
            <ExternalLink className="h-4 w-4 text-white/35" />
          </a>
        </section>

        <p className="mt-8 text-center text-[11px] text-white/35">{copy.pendingHint}</p>
      </div>

      {panel ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-3 sm:items-center">
          <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-[#121214] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="landing-serif text-xl text-[#F5EDE4]">
                {panel === "bill"
                  ? copy.currentBill
                  : panel === "banchan"
                    ? copy.requestBanchan
                    : panel === "grill"
                      ? copy.requestGrill
                      : copy.requestPayment}
              </h2>
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="rounded-full border border-white/10 p-2 text-white/70"
                aria-label={copy.close}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {panel === "bill" ? (
              <div className="space-y-3">
                {snapshot.bill.lines.length === 0 ? (
                  <p className="text-sm text-white/55">{copy.emptyBill}</p>
                ) : (
                  snapshot.bill.lines.map((line, index) => (
                    <div
                      key={`${line.name}-${index}`}
                      className="flex items-start justify-between gap-3 border-b border-white/5 pb-2 text-sm"
                    >
                      <div>
                        <p className="font-medium text-white/90">{line.name}</p>
                        <p className="text-xs text-white/40">
                          {line.quantity} × {formatCzk(line.unitPrice)}
                        </p>
                      </div>
                      <p className="tabular-nums text-white/80">{formatCzk(line.lineTotal)}</p>
                    </div>
                  ))
                )}
                <div className="flex items-center justify-between pt-2 text-base font-semibold">
                  <span>{copy.total}</span>
                  <span className="tabular-nums text-[#C9A88B]">{formatCzk(snapshot.bill.total)}</span>
                </div>
              </div>
            ) : null}

            {panel === "banchan" ? (
              <div className="space-y-3">
                <p className="text-sm text-white/55">{copy.selectBanchan}</p>
                {banchanOptions.map((option) => {
                  const qty = banchanQty[option.id] ?? 0;
                  return (
                    <div
                      key={option.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2"
                    >
                      <span className="text-sm">
                        {lang === "cs" ? option.labelCs : option.labelEn}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="h-8 w-8 rounded-full border border-white/15"
                          onClick={() =>
                            setBanchanQty((prev) => ({
                              ...prev,
                              [option.id]: Math.max(0, (prev[option.id] ?? 0) - 1),
                            }))
                          }
                        >
                          −
                        </button>
                        <span className="w-6 text-center tabular-nums">{qty}</span>
                        <button
                          type="button"
                          className="h-8 w-8 rounded-full border border-white/15"
                          onClick={() =>
                            setBanchanQty((prev) => ({
                              ...prev,
                              [option.id]: Math.min(20, (prev[option.id] ?? 0) + 1),
                            }))
                          }
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={copy.noteOptional}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
                  rows={2}
                />
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => {
                    const banchan = banchanOptions
                      .filter((option) => (banchanQty[option.id] ?? 0) > 0)
                      .map((option) => ({
                        id: option.id,
                        label: option.labelEn,
                        quantity: banchanQty[option.id] ?? 0,
                      }));
                    void sendRequest("banchan", { payload: { banchan, note }, note });
                  }}
                  className="mt-2 w-full rounded-full bg-[#C9A88B] px-4 py-3 text-sm font-semibold text-[#0B0B0C] disabled:opacity-50"
                >
                  {sending ? copy.sending : copy.send}
                </button>
              </div>
            ) : null}

            {panel === "grill" ? (
              <div className="space-y-4">
                <p className="text-sm text-white/60">{copy.grillHint}</p>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={copy.noteOptional}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
                  rows={2}
                />
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => void sendRequest("grill_change", { payload: { note }, note })}
                  className="w-full rounded-full bg-[#C9A88B] px-4 py-3 text-sm font-semibold text-[#0B0B0C] disabled:opacity-50"
                >
                  {sending ? copy.sending : copy.send}
                </button>
              </div>
            ) : null}

            {panel === "payment" ? (
              <div className="space-y-4">
                <p className="text-sm text-white/60">{copy.choosePayment}</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["card", "cash"] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`rounded-2xl border px-3 py-4 text-sm font-semibold ${
                        paymentMethod === method
                          ? "border-[#C9A88B] bg-[#C9A88B]/15 text-[#E8D5C4]"
                          : "border-white/10 bg-white/[0.03] text-white/70"
                      }`}
                    >
                      {method === "card" ? copy.card : copy.cash}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={sending}
                  onClick={() =>
                    void sendRequest("payment", { payload: { paymentMethod } })
                  }
                  className="w-full rounded-full bg-[#C9A88B] px-4 py-3 text-sm font-semibold text-[#0B0B0C] disabled:opacity-50"
                >
                  {sending ? copy.sending : copy.send}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-left transition hover:border-[#C9A88B]/40 hover:bg-white/[0.07] disabled:opacity-50"
    >
      <span className="text-[#C9A88B]">{icon}</span>
      <span className="text-sm font-medium text-white/90">{label}</span>
    </button>
  );
}
