"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { HeaderClockWithStatus } from "@/components/connection-status-badge";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import { formatVoucherAmount, type VoucherCode, type VoucherOrder } from "@/lib/voucher";

const VOUCHER_PAGE_SIZE = 20;

function formatWhen(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString([], {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Full-row status tint for the vouchers list:
 * - green  = issued, not yet used
 * - blue   = redeemed (partially / fully)
 * - yellow = paid or pending, not yet issued
 * - rose   = cancelled / refunded
 */
function voucherRowTone(order: VoucherOrder): string {
  if (
    order.paymentStatus === "cancelled" ||
    order.paymentStatus === "refunded" ||
    order.orderStatus === "cancelled"
  ) {
    return "border-l-4 border-l-rose-400 bg-rose-50/95 hover:bg-rose-100/90 dark:border-l-rose-500 dark:bg-rose-950/40 dark:hover:bg-rose-950/55";
  }
  if (order.orderStatus === "partially_redeemed" || order.orderStatus === "fully_redeemed") {
    return "border-l-4 border-l-blue-500 bg-blue-50/95 hover:bg-blue-100/90 dark:border-l-blue-400 dark:bg-blue-950/40 dark:hover:bg-blue-950/55";
  }
  if (order.orderStatus === "issued") {
    return "border-l-4 border-l-emerald-500 bg-emerald-50/95 hover:bg-emerald-100/90 dark:border-l-emerald-400 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/55";
  }
  // pending payment, guest marked paid, or paid but codes not issued yet
  return "border-l-4 border-l-amber-400 bg-amber-50/95 hover:bg-amber-100/90 dark:border-l-amber-500 dark:bg-amber-950/35 dark:hover:bg-amber-950/50";
}

export function VouchersView({
  focusOrderId,
  onFocusOrderConsumed,
}: {
  focusOrderId?: string | null;
  onFocusOrderConsumed?: () => void;
} = {}) {
  const { translate, currentStaffUser } = useApp();
  const [orders, setOrders] = useState<VoucherOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "paid" | "issued">("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<VoucherOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmVerify, setConfirmVerify] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [lookup, setLookup] = useState<{ code: VoucherCode; order: VoucherOrder | null } | null>(
    null,
  );
  const [scanError, setScanError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/vouchers/staff/orders");
      const payload = (await response.json()) as { orders?: VoucherOrder[]; error?: string };
      if (!response.ok) {
        setError(payload.error || "Failed to load vouchers.");
        setOrders([]);
      } else {
        setOrders(payload.orders ?? []);
      }
    } catch {
      setError("Failed to load vouchers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!focusOrderId || orders.length === 0) return;
    const match = orders.find((order) => order.id === focusOrderId);
    if (match) {
      setSelected(match);
      setConfirmVerify(false);
      onFocusOrderConsumed?.();
    }
  }, [focusOrderId, orders, onFocusOrderConsumed]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((order) => {
      if (statusFilter === "pending" && order.paymentStatus !== "pending") return false;
      if (statusFilter === "paid" && order.paymentStatus !== "paid") return false;
      if (statusFilter === "issued" && order.orderStatus !== "issued" && order.orderStatus !== "partially_redeemed" && order.orderStatus !== "fully_redeemed") {
        return false;
      }
      if (!q) return true;
      const codeHit = (order.codes ?? []).some((c) => c.code.toLowerCase().includes(q));
      return (
        order.orderId.toLowerCase().includes(q) ||
        order.buyerEmail.toLowerCase().includes(q) ||
        order.buyerName.toLowerCase().includes(q) ||
        (order.buyerPhone ?? "").toLowerCase().includes(q) ||
        codeHit
      );
    });
  }, [orders, query, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / VOUCHER_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(() => {
    const start = (currentPage - 1) * VOUCHER_PAGE_SIZE;
    return filtered.slice(start, start + VOUCHER_PAGE_SIZE);
  }, [filtered, currentPage]);

  const stopCamera = useCallback(() => {
    if (scanLoopRef.current != null) {
      window.clearInterval(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!scanOpen) {
      stopCamera();
      return;
    }
    let cancelled = false;
    void (async () => {
      setScanError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        // Native BarcodeDetector when available
        const Detector = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => { detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
        if (!Detector || !videoRef.current) return;
        const detector = new Detector({ formats: ["qr_code"] });
        scanLoopRef.current = window.setInterval(() => {
          const video = videoRef.current;
          if (!video || video.readyState < 2) return;
          void detector
            .detect(video)
            .then((codes) => {
              const value = codes[0]?.rawValue?.trim();
              if (value) void lookupCode(value);
            })
            .catch(() => {
              /* ignore frame errors */
            });
        }, 700);
      } catch {
        setScanError(translate("voucherScanCameraDenied"));
      }
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanOpen, stopCamera]);

  const lookupCode = async (code: string) => {
    setScanError(null);
    try {
      const response = await fetch(`/api/vouchers/staff/redeem?code=${encodeURIComponent(code)}`);
      const payload = (await response.json()) as {
        code?: VoucherCode;
        order?: VoucherOrder | null;
        error?: string;
      };
      if (!response.ok || !payload.code) {
        setLookup(null);
        setScanError(payload.error || translate("voucherNotFound"));
        return;
      }
      stopCamera();
      setLookup({ code: payload.code, order: payload.order ?? null });
      setManualCode(payload.code.code);
    } catch {
      setScanError(translate("voucherNotFound"));
    }
  };

  const verifyPayment = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/vouchers/staff/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderUuid: selected.id }),
      });
      const payload = (await response.json()) as { order?: VoucherOrder; error?: string };
      if (!response.ok || !payload.order) {
        setError(payload.error || "Verification failed.");
        return;
      }
      setSelected(payload.order);
      setConfirmVerify(false);
      void load();
    } catch {
      setError("Verification failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-background text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200/80 bg-background px-2.5 py-1.5 sm:px-4 sm:py-2.5 lg:px-6 lg:py-4 dark:border-gray-800 dark:bg-gray-900">
        <div>
          <h1 className="text-sm font-semibold sm:text-base lg:text-lg">
            {translate("vouchersTitle")}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {translate("vouchersHint")}
          </p>
          <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
            {translate("voucherApplyNote")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setLookup(null);
              setManualCode("");
              setScanError(null);
              setScanOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
          >
            <Camera className="h-4 w-4" />
            {translate("voucherScanButton")}
          </button>
          <HeaderClockWithStatus />
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={translate("voucherSearchPlaceholder")}
                className="pos-input w-full pl-9"
              />
            </div>
            {(["all", "pending", "paid", "issued"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  statusFilter === key
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                    : "border border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300"
                }`}
              >
                {translate(
                  key === "all"
                    ? "voucherFilterAll"
                    : key === "pending"
                      ? "voucherFilterPending"
                      : key === "paid"
                        ? "voucherFilterPaid"
                        : "voucherFilterIssued",
                )}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium dark:border-gray-700"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-gray-500">{translate("loading")}</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 px-6 py-12 text-center text-sm text-gray-500 dark:border-gray-700">
              {translate("voucherEmpty")}
            </p>
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                <table className="w-full min-w-[960px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700">
                      <th className="px-4 py-3">{translate("voucherOrderId")}</th>
                      <th className="px-4 py-3">{translate("voucherCustomer")}</th>
                      <th className="px-4 py-3 text-right">{translate("voucherAmount")}</th>
                      <th className="px-4 py-3 text-right">{translate("voucherQty")}</th>
                      <th className="px-4 py-3">{translate("voucherPayment")}</th>
                      <th className="px-4 py-3">{translate("voucherStatus")}</th>
                      <th className="px-4 py-3">{translate("voucherCreated")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((order) => (
                      <tr
                        key={order.id}
                        className={`cursor-pointer border-b border-gray-100/80 dark:border-gray-700/50 ${voucherRowTone(order)}`}
                        onClick={() => {
                          setSelected(order);
                          setConfirmVerify(false);
                        }}
                      >
                        <td className="px-4 py-3 font-semibold tabular-nums">{order.orderId}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{order.buyerName || "—"}</p>
                          <p className="text-xs text-gray-500">{order.buyerEmail}</p>
                          {order.buyerPhone ? (
                            <p className="text-xs text-gray-500">{order.buyerPhone}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">
                          {formatVoucherAmount(order.totalCzk)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{order.quantity}</td>
                        <td className="px-4 py-3 capitalize">
                          {order.paymentMethod === "czech_qr" ? "Czech QR" : "Transfer"} ·{" "}
                          {order.paymentStatus}
                        </td>
                        <td className="px-4 py-3">
                          {order.orderStatus.replaceAll("_", " ")}
                          {order.guestMarkedPaidAt && order.paymentStatus === "pending" ? (
                            <span className="mt-0.5 block text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                              {translate("voucherGuestPaid")}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-gray-600 dark:text-gray-300">
                          {formatWhen(order.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filtered.length > VOUCHER_PAGE_SIZE ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {translate("historyPageOf")
                      .replace("{page}", String(currentPage))
                      .replace("{total}", String(totalPages))}
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      (
                      {translate("historyPageShowing")
                        .replace("{from}", String((currentPage - 1) * VOUCHER_PAGE_SIZE + 1))
                        .replace(
                          "{to}",
                          String(Math.min(currentPage * VOUCHER_PAGE_SIZE, filtered.length)),
                        )
                        .replace("{count}", String(filtered.length))}
                      )
                    </span>
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((prev) => Math.max(1, Math.min(prev, totalPages) - 1))}
                      disabled={currentPage <= 1}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 enabled:hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-200 dark:enabled:hover:bg-gray-700"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      {translate("historyPrevPage")}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPage((prev) => Math.min(totalPages, Math.min(prev, totalPages) + 1))
                      }
                      disabled={currentPage >= totalPages}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 enabled:hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-200 dark:enabled:hover:bg-gray-700"
                    >
                      {translate("historyNextPage")}
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={selected != null}
        onClose={() => {
          setSelected(null);
          setConfirmVerify(false);
        }}
        title={selected?.orderId ?? translate("vouchersTitle")}
        zIndexClass="z-[110]"
      >
        {selected ? (
          <div className="space-y-4 text-sm">
            <dl className="space-y-1.5">
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">{translate("voucherCustomer")}</dt>
                <dd className="text-right">
                  {selected.buyerName}
                  <br />
                  <span className="text-xs text-gray-500">{selected.buyerEmail}</span>
                  {selected.buyerPhone ? (
                    <>
                      <br />
                      <span className="text-xs text-gray-500">
                        {translate("voucherPhone")}: {selected.buyerPhone}
                      </span>
                    </>
                  ) : null}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">{translate("voucherAmount")}</dt>
                <dd className="font-semibold">
                  {formatVoucherAmount(selected.denominationCzk)} × {selected.quantity} ={" "}
                  {formatVoucherAmount(selected.totalCzk)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">{translate("voucherPayment")}</dt>
                <dd>
                  {selected.paymentMethod} · {selected.paymentStatus}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">{translate("voucherStatus")}</dt>
                <dd>{selected.orderStatus}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">{translate("voucherCreated")}</dt>
                <dd>{formatWhen(selected.createdAt)}</dd>
              </div>
              {selected.paymentExpiresAt ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">{translate("voucherPayBy")}</dt>
                  <dd>{formatWhen(selected.paymentExpiresAt)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">{translate("voucherGuestPaid")}</dt>
                <dd>{formatWhen(selected.guestMarkedPaidAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">{translate("voucherVerified")}</dt>
                <dd>
                  {formatWhen(selected.verifiedAt)}
                  {selected.verifiedByStaffName ? ` · ${selected.verifiedByStaffName}` : ""}
                </dd>
              </div>
            </dl>

            {(selected.codes?.length ?? 0) > 0 ? (
              <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {translate("voucherCodes")}
                </p>
                <ul className="mt-2 space-y-1">
                  {selected.codes!.map((c) => (
                    <li key={c.id} className="flex justify-between gap-2 font-mono text-xs">
                      <span>{c.code}</span>
                      <span className="text-gray-500">{c.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {selected.paymentStatus === "pending" ? (
              confirmVerify ? (
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
                  <p className="text-sm text-amber-900 dark:text-amber-100">
                    {translate("voucherVerifyConfirm")}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void verifyPayment()}
                      className="flex-1 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
                    >
                      {translate("voucherConfirmPayment")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmVerify(false)}
                      className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm dark:border-gray-600"
                    >
                      {translate("voucherCancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmVerify(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 py-3 text-sm font-semibold text-white"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {translate("voucherPaymentReceived")}
                </button>
              )
            ) : null}
            <p className="text-xs text-gray-400">
              Staff: {currentStaffUser?.name ?? "—"}
            </p>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={scanOpen}
        onClose={() => {
          setScanOpen(false);
          stopCamera();
        }}
        title={translate("voucherScanButton")}
        zIndexClass="z-[110]"
      >
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} className="aspect-square w-full object-cover" playsInline muted />
          </div>
          {scanError ? <p className="text-sm text-red-600">{scanError}</p> : null}
          <div className="flex gap-2">
            <input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="SPV-…"
              className="pos-input flex-1 font-mono"
            />
            <button
              type="button"
              onClick={() => void lookupCode(manualCode)}
              className="rounded-xl bg-gray-900 px-4 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
            >
              {translate("voucherLookup")}
            </button>
          </div>

          {lookup ? (
            <div className="space-y-2 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              <p className="font-mono text-lg font-bold">{lookup.code.code}</p>
              <p>{formatVoucherAmount(lookup.code.denominationCzk)}</p>
              <p className="text-sm capitalize text-gray-600 dark:text-gray-300">
                {translate("voucherStatus")}: {lookup.code.status}
              </p>
              {lookup.order ? (
                <p className="text-xs text-gray-500">
                  {lookup.order.orderId} · {lookup.order.buyerEmail}
                </p>
              ) : null}
              <p className="text-xs text-gray-500">
                {translate("voucherCreated")}: {formatWhen(lookup.code.createdAt)}
                {lookup.code.expiresAt
                  ? ` · ${translate("voucherExpires")}: ${formatWhen(lookup.code.expiresAt)}`
                  : ""}
              </p>
              {lookup.code.status === "issued" || lookup.code.status === "applied" ? (
                <p className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
                  {translate("voucherRedeemOnPayment")}
                </p>
              ) : (
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                  {translate("voucherCannotRedeem")}
                </p>
              )}
              <p className="text-xs text-gray-500">{translate("voucherApplyNote")}</p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => {
              setScanOpen(false);
              stopCamera();
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 py-2.5 text-sm dark:border-gray-600"
          >
            <X className="h-4 w-4" />
            {translate("voucherCancel")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
