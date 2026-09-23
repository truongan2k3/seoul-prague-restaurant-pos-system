"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, Check, Gift, Search } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { POS_HOME_PATH } from "@/lib/page-routes";
import { formatVoucherAmount, type VoucherCode } from "@/lib/voucher";
import type { RestaurantTable } from "@/lib/types";
import {
  fetchTableSummaries,
  mapTableRow,
  type SupabaseTableRow,
} from "@/src/lib/supabase-data";

type Phase = "scan" | "details" | "confirm" | "success";

function isOpenTable(table: RestaurantTable): boolean {
  return table.status !== "empty";
}

function statusLabel(table: RestaurantTable, translate: (key: "open" | "closed" | "paid") => string) {
  if (table.status === "empty") return translate("closed");
  if (table.paymentStatus === "paid") return translate("paid");
  return translate("open");
}

export function ToolsVoucherScannerView() {
  const { translate } = useApp();
  const [phase, setPhase] = useState<Phase>("scan");
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [tableSearch, setTableSearch] = useState("");
  const [lookupCode, setLookupCode] = useState("");
  const [voucher, setVoucher] = useState<VoucherCode | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number | null>(null);
  const scanningRef = useRef(false);

  const openTables = useMemo(
    () => tables.filter(isOpenTable).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
    [tables],
  );

  const filteredTables = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return openTables;
    return openTables.filter(
      (table) =>
        table.label.toLowerCase().includes(q) ||
        table.id.toLowerCase().includes(q),
    );
  }, [openTables, tableSearch]);

  const selectedTable = openTables.find((table) => table.id === selectedTableId) ?? null;

  const stopCamera = useCallback(() => {
    if (scanLoopRef.current != null) {
      window.clearInterval(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const reloadTables = useCallback(async () => {
    setTablesLoading(true);
    try {
      const { data, error: fetchError } = await fetchTableSummaries();
      if (fetchError) {
        setError(fetchError.message);
        setTables([]);
        return;
      }
      setTables(((data ?? []) as SupabaseTableRow[]).map(mapTableRow));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tables.");
      setTables([]);
    } finally {
      setTablesLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadTables();
  }, [reloadTables]);

  const lookupVoucher = useCallback(async (raw: string) => {
    const code = raw.trim();
    if (!code || scanningRef.current) return;
    scanningRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/vouchers/staff/redeem?code=${encodeURIComponent(code)}`,
      );
      const payload = (await response.json()) as {
        code?: VoucherCode;
        error?: string;
      };
      if (!response.ok || !payload.code) {
        setError(payload.error || translate("voucherNotFound"));
        return;
      }
      const found = payload.code;
      if (found.status === "redeemed") {
        setError(translate("voucherAlreadyRedeemed"));
        setVoucher(found);
        return;
      }
      if (found.status === "cancelled" || found.status === "expired") {
        setError(
          found.status === "expired"
            ? translate("voucherExpired")
            : translate("voucherCancelled"),
        );
        setVoucher(found);
        return;
      }
      if (found.status === "applied" && found.appliedTableId) {
        setError(translate("voucherAlreadyApplied"));
        setVoucher(found);
        return;
      }
      if (found.status !== "issued" && found.status !== "applied") {
        setError(translate("voucherCannotApply"));
        setVoucher(found);
        return;
      }
      stopCamera();
      setVoucher(found);
      setLookupCode(found.code);
      setSelectedTableId(null);
      setPhase("details");
      void reloadTables();
    } catch {
      setError(translate("voucherNotFound"));
    } finally {
      setBusy(false);
      scanningRef.current = false;
    }
  }, [reloadTables, stopCamera, translate]);

  useEffect(() => {
    if (phase !== "scan") {
      stopCamera();
      return;
    }
    let cancelled = false;
    void (async () => {
      setCameraError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const Detector = (
          window as unknown as {
            BarcodeDetector?: new (opts: { formats: string[] }) => {
              detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
            };
          }
        ).BarcodeDetector;
        if (!Detector || !videoRef.current) return;
        const detector = new Detector({ formats: ["qr_code"] });
        scanLoopRef.current = window.setInterval(() => {
          const video = videoRef.current;
          if (!video || video.readyState < 2 || scanningRef.current) return;
          void detector
            .detect(video)
            .then((codes) => {
              const value = codes[0]?.rawValue?.trim();
              if (value) void lookupVoucher(value);
            })
            .catch(() => {
              /* ignore */
            });
        }, 700);
      } catch {
        setCameraError(translate("voucherScanCameraDenied"));
      }
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [phase, stopCamera, lookupVoucher, translate]);

  const applyToTable = async () => {
    if (!voucher || !selectedTable) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/vouchers/staff/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          code: voucher.code,
          tableId: selectedTable.id,
          tableLabel: selectedTable.label,
        }),
      });
      const payload = (await response.json()) as { code?: VoucherCode; error?: string };
      if (!response.ok) {
        setError(payload.error || "Could not apply voucher.");
        return;
      }
      if (payload.code) setVoucher(payload.code);
      setPhase("success");
    } catch {
      setError("Could not apply voucher.");
    } finally {
      setBusy(false);
    }
  };

  const resetToScan = () => {
    setPhase("scan");
    setVoucher(null);
    setLookupCode("");
    setSelectedTableId(null);
    setError(null);
    setTableSearch("");
    scanningRef.current = false;
  };

  const tStatus = (key: "open" | "closed" | "paid") => {
    if (key === "open") return translate("toolsTableOpen");
    if (key === "paid") return translate("toolsTablePaid");
    return translate("toolsTableClosed");
  };

  return (
    <div className="min-h-dvh bg-[#0B0B0C] text-[#F5EDE4]">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0B0B0C]/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={POS_HOME_PATH}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70 hover:text-white"
              aria-label={translate("toolsBack")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#C9A88B]">
                {translate("toolsTitle")}
              </p>
              <h1 className="truncate text-base font-semibold tracking-tight">
                {translate("toolsVoucherScanner")}
              </h1>
            </div>
          </div>
          <Gift className="h-5 w-5 shrink-0 text-[#C9A88B]" />
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pb-10 pt-5">
        {phase === "scan" ? (
          <section className="space-y-4">
            <p className="text-sm text-white/55">{translate("toolsVoucherScanHint")}</p>

            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black">
              <video
                ref={videoRef}
                className="aspect-[3/4] w-full object-cover"
                playsInline
                muted
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-48 w-48 rounded-2xl border-2 border-[#C9A88B] shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
              </div>
              <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1.5 text-xs font-medium text-white/90">
                  <Camera className="h-3.5 w-3.5" />
                  {translate("toolsAlignQr")}
                </span>
              </div>
            </div>

            {cameraError ? (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                {cameraError}
              </p>
            ) : null}
            {error ? <p className="text-sm text-red-300">{error}</p> : null}

            <div className="flex gap-2">
              <input
                value={lookupCode}
                onChange={(event) => setLookupCode(event.target.value)}
                placeholder="SPV-…"
                className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-3 font-mono text-sm text-white outline-none focus:border-[#C9A88B]/60"
                disabled={busy}
              />
              <button
                type="button"
                disabled={busy || !lookupCode.trim()}
                onClick={() => void lookupVoucher(lookupCode)}
                className="rounded-xl bg-[#C9A88B] px-4 text-sm font-semibold text-[#0B0B0C] disabled:opacity-40"
              >
                {busy ? "…" : translate("voucherLookup")}
              </button>
            </div>
            <p className="text-xs text-white/40">{translate("voucherApplyNote")}</p>
          </section>
        ) : null}

        {phase === "details" && voucher ? (
          <section className="space-y-5">
            <div className="rounded-2xl border border-[#C9A88B]/35 bg-[#121214] p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#C9A88B]">
                {translate("toolsVoucherDetails")}
              </p>
              <p className="mt-2 font-mono text-sm text-white/80">{voucher.code}</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-[#F5EDE4]">
                {formatVoucherAmount(voucher.denominationCzk)}
              </p>
              <p className="mt-2 text-xs uppercase tracking-wider text-white/45">
                {translate("summaryGuestStatus")}: {voucher.status}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-white/80">
                {translate("toolsSelectOpenTable")}
              </p>
              <p className="mt-1 text-xs text-white/45">{translate("toolsSelectOpenTableHint")}</p>

              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input
                  value={tableSearch}
                  onChange={(event) => setTableSearch(event.target.value)}
                  placeholder={translate("toolsSearchTable")}
                  className="w-full rounded-xl border border-white/15 bg-white/5 py-3 pl-10 pr-3 text-sm text-white outline-none focus:border-[#C9A88B]/60"
                />
              </div>

              {tablesLoading ? (
                <p className="mt-4 text-sm text-white/45">{translate("summaryGuestLoading")}</p>
              ) : filteredTables.length === 0 ? (
                <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-white/50">
                  {translate("toolsNoOpenTables")}
                </p>
              ) : (
                <ul className="mt-3 max-h-[40vh] space-y-2 overflow-y-auto">
                  {filteredTables.map((table) => {
                    const selected = selectedTableId === table.id;
                    return (
                      <li key={table.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedTableId(table.id)}
                          className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
                            selected
                              ? "border-[#C9A88B] bg-[#C9A88B]/15"
                              : "border-white/10 bg-white/[0.03] hover:border-white/25"
                          }`}
                        >
                          <span>
                            <span className="block text-sm font-semibold text-[#F5EDE4]">
                              {translate("table")} {table.label}
                            </span>
                            <span className="mt-0.5 block text-xs text-white/45">
                              {statusLabel(table, tStatus)}
                            </span>
                          </span>
                          {selected ? <Check className="h-4 w-4 text-[#C9A88B]" /> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {error ? <p className="text-sm text-red-300">{error}</p> : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={resetToScan}
                className="rounded-xl border border-white/20 py-3 text-sm font-semibold text-white/80"
              >
                {translate("toolsScanAgain")}
              </button>
              <button
                type="button"
                disabled={!selectedTable || busy}
                onClick={() => setPhase("confirm")}
                className="rounded-xl bg-[#C9A88B] py-3 text-sm font-semibold text-[#0B0B0C] disabled:opacity-40"
              >
                {translate("toolsContinueApply")}
              </button>
            </div>
          </section>
        ) : null}

        {phase === "confirm" && voucher && selectedTable ? (
          <section className="space-y-5">
            <div className="rounded-2xl border border-[#C9A88B]/40 bg-[#121214] p-5 text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-[#C9A88B]">
                {translate("toolsConfirmApply")}
              </p>
              <p className="mt-4 text-lg text-[#F5EDE4]">
                {translate("toolsConfirmApplyBody")
                  .replace("{amount}", formatVoucherAmount(voucher.denominationCzk))
                  .replace("{table}", selectedTable.label)}
              </p>
              <p className="mt-2 font-mono text-xs text-white/45">{voucher.code}</p>
              <p className="mt-4 text-xs text-white/40">{translate("voucherApplyNote")}</p>
            </div>

            {error ? <p className="text-sm text-red-300">{error}</p> : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setPhase("details")}
                className="rounded-xl border border-white/20 py-3 text-sm font-semibold text-white/80"
              >
                {translate("toolsBack")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void applyToTable()}
                className="rounded-xl bg-[#C9A88B] py-3 text-sm font-semibold text-[#0B0B0C] disabled:opacity-40"
              >
                {busy ? "…" : translate("toolsConfirmApplyBtn")}
              </button>
            </div>
          </section>
        ) : null}

        {phase === "success" && voucher && selectedTable ? (
          <section className="space-y-5">
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                <Check className="h-6 w-6" />
              </div>
              <p className="mt-4 text-lg font-semibold text-[#F5EDE4]">
                {translate("voucherAppliedOk")}
              </p>
              <p className="mt-2 text-sm text-white/65">
                {formatVoucherAmount(voucher.denominationCzk)} → {translate("table")}{" "}
                {selectedTable.label}
              </p>
              <p className="mt-1 font-mono text-xs text-white/40">{voucher.code}</p>
              <p className="mt-4 text-xs text-white/45">{translate("voucherApplyNote")}</p>
            </div>

            <button
              type="button"
              onClick={resetToScan}
              className="w-full rounded-xl bg-[#C9A88B] py-3.5 text-sm font-semibold text-[#0B0B0C]"
            >
              {translate("toolsScanAnother")}
            </button>
            <Link
              href={POS_HOME_PATH}
              className="block w-full rounded-xl border border-white/20 py-3 text-center text-sm font-semibold text-white/80"
            >
              {translate("toolsBackToPos")}
            </Link>
          </section>
        ) : null}
      </main>
    </div>
  );
}
