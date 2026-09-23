"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Gift, X } from "lucide-react";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import { formatVoucherAmount, type VoucherCode } from "@/lib/voucher";

export interface VoucherScanFabProps {
  activeTableId: string | null;
  tableLabel?: string | null;
  staffName?: string | null;
  onApplied?: (code: VoucherCode) => void;
  onOpenVouchersTab?: () => void;
  /** Apply via parent workflow (POST apply + refresh). */
  applyVoucherCode: (
    code: string,
    tableId?: string,
    tableLabel?: string,
  ) => Promise<{ error: string | null; code?: VoucherCode }>;
}

export function VoucherScanFab({
  activeTableId,
  tableLabel,
  onApplied,
  onOpenVouchersTab,
  applyVoucherCode,
}: VoucherScanFabProps) {
  const { translate } = useApp();
  const [open, setOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastApplied, setLastApplied] = useState<VoucherCode | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number | null>(null);
  const applyingRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (scanLoopRef.current != null) {
      window.clearInterval(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    stopCamera();
    setError(null);
    setManualCode("");
    applyingRef.current = false;
  }, [stopCamera]);

  const handleApply = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code || applyingRef.current) return;
      if (!activeTableId) {
        setError(translate("voucherScanNeedTable"));
        return;
      }
      applyingRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const result = await applyVoucherCode(
          code,
          activeTableId,
          tableLabel ?? undefined,
        );
        if (result.error) {
          setError(result.error);
          return;
        }
        stopCamera();
        if (result.code) {
          setLastApplied(result.code);
          onApplied?.(result.code);
        }
        setManualCode(result.code?.code ?? code);
      } finally {
        setBusy(false);
        applyingRef.current = false;
      }
    },
    [activeTableId, applyVoucherCode, onApplied, stopCamera, tableLabel, translate],
  );

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }
    let cancelled = false;
    void (async () => {
      setError(null);
      setLastApplied(null);
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
          if (!video || video.readyState < 2 || applyingRef.current) return;
          void detector
            .detect(video)
            .then((codes) => {
              const value = codes[0]?.rawValue?.trim();
              if (value) void handleApply(value);
            })
            .catch(() => {
              /* ignore frame errors */
            });
        }, 700);
      } catch {
        setError(translate("voucherScanCameraDenied"));
      }
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, stopCamera, handleApply, translate]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-[115] flex min-h-[3.25rem] items-center gap-2 rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-900/30 hover:bg-emerald-600 sm:bottom-24 sm:right-5 sm:min-h-[3.5rem] sm:px-5 sm:text-base"
        aria-label={translate("voucherScanFab")}
      >
        <Gift className="h-5 w-5 shrink-0" />
        <Camera className="h-5 w-5 shrink-0 opacity-90" />
        <span>{translate("voucherScanFab")}</span>
      </button>

      <Modal
        open={open}
        onClose={close}
        title={translate("voucherScanFab")}
        zIndexClass="z-[120]"
      >
        <div className="space-y-4">
          {!activeTableId ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {translate("voucherScanNeedTable")}
            </p>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {translate("table")} {tableLabel ?? activeTableId}
            </p>
          )}

          <div className="overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} className="aspect-square w-full object-cover" playsInline muted />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {lastApplied ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
              {translate("voucherAppliedOk")} · {lastApplied.code} ·{" "}
              {formatVoucherAmount(lastApplied.denominationCzk)}
            </p>
          ) : null}

          <div className="flex gap-2">
            <input
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value)}
              placeholder="SPV-…"
              className="pos-input flex-1 font-mono"
              disabled={busy}
            />
            <button
              type="button"
              disabled={busy || !manualCode.trim()}
              onClick={() => void handleApply(manualCode)}
              className="rounded-xl bg-gray-900 px-4 text-sm font-semibold text-white disabled:opacity-40 dark:bg-gray-100 dark:text-gray-900"
            >
              {translate("voucherLookup")}
            </button>
          </div>

          <p className="text-xs text-gray-500">{translate("voucherApplyNote")}</p>

          <div className="flex flex-col gap-2 sm:flex-row">
            {onOpenVouchersTab ? (
              <button
                type="button"
                onClick={() => {
                  close();
                  onOpenVouchersTab();
                }}
                className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-semibold dark:border-gray-600"
              >
                {translate("vouchersTitle")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={close}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-300 py-2.5 text-sm dark:border-gray-600"
            >
              <X className="h-4 w-4" />
              {translate("voucherCancel")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
