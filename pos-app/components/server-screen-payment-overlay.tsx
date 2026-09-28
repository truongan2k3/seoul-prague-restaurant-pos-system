"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyCfdSnapshot,
  checkoutPayloadFingerprint,
  fetchCfdDisplaySnapshot,
  releaseCfdThankYouState,
  subscribeCfdEvents,
  type CfdCheckoutPayload,
  type CfdClientState,
} from "@/lib/cfd-display";
import { formatCzk } from "@/lib/checkout-calculations";
import type { TranslationKey } from "@/lib/i18n/translations";
import { subscribeToPostgresRowChanges } from "@/lib/realtime-subscribe";
import { useSettings } from "@/contexts/settings-context";
import { useBlobUrl } from "@/hooks/use-blob-url-cache";

const THANK_YOU_SECONDS = 12;
const MIN_THANK_YOU_BEFORE_NEXT_SECONDS = 5;

function KdsCheckoutPanel({
  checkout,
  translate,
}: {
  checkout: CfdCheckoutPayload;
  translate: (key: TranslationKey) => string;
}) {
  const displayTotal = checkout.total ?? checkout.amountDueNow;
  const isSplitSelect = checkout.mode === "split-select";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0B0B0C]">
      <div className="shrink-0 border-b border-white/10 px-4 py-4 sm:px-6">
        <p className="font-serif text-2xl text-[#F5EDE4] sm:text-3xl">
          {translate("table")}: {checkout.tableNumber}
        </p>
        {isSplitSelect ? (
          <div className="mt-3 border border-[#C9A88B]/35 bg-[#8B1E2D]/20 px-4 py-3">
            <p className="text-lg font-semibold text-[#E8D5C4]">{translate("cfdPleaseSelectItems")}</p>
            <p className="mt-1 text-sm text-[#C9A88B]/80">{translate("cfdSplitSelectHint")}</p>
          </div>
        ) : (
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.22em] text-[#C9A88B]/80">
            {translate("orderDetails")}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
        <div className="overflow-hidden border border-white/10 bg-[#121214]">
          <table className="w-full text-left">
            <thead className="sticky top-0 z-10 bg-[#161618] text-xs font-semibold uppercase tracking-wider text-[#C9A88B]/85">
              <tr>
                <th className="px-4 py-3 text-center">{translate("cfdQty")}</th>
                <th className="px-4 py-3">{translate("itemName")}</th>
                <th className="px-4 py-3 text-right">{translate("total")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {checkout.items.map((item, index) => {
                const isVoucher = item.kind === "voucher" || item.highlight;
                return (
                  <tr
                    key={`${item.name}-${index}`}
                    className={isVoucher ? "bg-emerald-950/50 text-emerald-100" : "text-[#F5EDE4]"}
                  >
                    <td
                      className={`px-4 py-3 text-center text-2xl font-semibold tabular-nums ${
                        isVoucher ? "text-emerald-300" : "text-[#C9A88B]"
                      }`}
                    >
                      {item.quantity}
                    </td>
                    <td className="px-4 py-3 text-lg font-medium leading-snug">{item.name}</td>
                    <td
                      className={`px-4 py-3 text-right text-xl font-semibold tabular-nums ${
                        isVoucher ? "text-emerald-200" : ""
                      }`}
                    >
                      {formatCzk(item.lineTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <footer className="shrink-0 border-t border-white/10 bg-[#121214] px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-2 text-lg text-white/65">
          {!isSplitSelect ? (
            <>
              <div className="flex justify-between">
                <span>{translate("subtotal")}</span>
                <span className="tabular-nums">{formatCzk(checkout.subtotal)}</span>
              </div>
              {checkout.discount > 0 ? (
                <div className="flex justify-between text-[#C9A88B]">
                  <span>{translate("discount")}</span>
                  <span className="tabular-nums">−{formatCzk(checkout.discount)}</span>
                </div>
              ) : null}
              {(checkout.voucherDiscount ?? 0) > 0 ? (
                <div className="flex justify-between font-semibold text-emerald-300">
                  <span>{translate("voucherLabel")}</span>
                  <span className="tabular-nums">−{formatCzk(checkout.voucherDiscount ?? 0)}</span>
                </div>
              ) : null}
              {checkout.tip > 0 ? (
                <div className="flex justify-between text-[#E8D5C4]">
                  <span>{translate("tip")}</span>
                  <span className="tabular-nums">{formatCzk(checkout.tip)}</span>
                </div>
              ) : null}
            </>
          ) : null}
          <div className="flex items-end justify-between border-t border-white/10 pt-3">
            <span className="text-xl font-semibold uppercase tracking-wide text-white">
              {translate("total")}
            </span>
            <span className="text-4xl font-black tabular-nums text-[#F5EDE4] sm:text-5xl">
              {formatCzk(displayTotal)} CZK
            </span>
          </div>
          {!isSplitSelect && checkout.changeDue != null && checkout.changeDue > 0 ? (
            <div className="mt-3 flex items-end justify-between border border-[#C9A88B]/45 bg-[#C9A88B]/10 px-4 py-4">
              <span className="text-lg font-semibold uppercase tracking-wide text-[#E8D5C4]">
                {translate("changeDue")}
              </span>
              <span className="text-4xl font-black tabular-nums text-[#F5EDE4]">
                {formatCzk(checkout.changeDue)} CZK
              </span>
            </div>
          ) : null}
        </div>
      </footer>
    </div>
  );
}

function KdsThankYouPanel({
  secondsLeft,
  reviewQrImageUrl,
  translate,
}: {
  secondsLeft: number;
  reviewQrImageUrl: string;
  translate: (key: TranslationKey) => string;
}) {
  const hasQr = reviewQrImageUrl.trim().length > 0;
  const qrBlobSrc = useBlobUrl(reviewQrImageUrl);
  const qrSrc = qrBlobSrc || reviewQrImageUrl;
  const countdownText = translate("cfdReturningIn").replace("{seconds}", String(secondsLeft));

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10 text-center">
      <h2 className="font-serif text-3xl text-[#F5EDE4] sm:text-4xl">{translate("cfdThankYou")}</h2>
      <p className="mt-4 max-w-xl text-lg text-white/60">{translate("cfdReviewPrompt")}</p>
      <p className="mt-6 text-3xl tracking-[0.35em] text-[#C9A88B]" aria-label="5 star rating">
        ★★★★★
      </p>
      {hasQr ? (
        <>
          <div className="mt-8 border border-white/15 bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSrc}
              alt={translate("cfdScanReview")}
              width={180}
              height={180}
              className="h-[180px] w-[180px] object-contain"
            />
          </div>
          <p className="mt-4 text-sm text-white/40">{translate("cfdScanReview")}</p>
        </>
      ) : null}
      <p className="mt-8 text-xs uppercase tracking-[0.18em] text-white/30">{countdownText}</p>
    </div>
  );
}

/**
 * Kitchen-only payment overlay — mirrors Client Screen checkout via the shared CFD channel.
 * When idle / cancelled / thank-you finishes, children (KDS board) show again.
 */
export function ServerScreenPaymentOverlay({
  enabled,
  translate,
  children,
}: {
  enabled: boolean;
  translate: (key: TranslationKey) => string;
  children: React.ReactNode;
}) {
  const { settings } = useSettings();
  const [clientState, setClientState] = useState<CfdClientState>("idle");
  const [checkout, setCheckout] = useState<CfdCheckoutPayload | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(THANK_YOU_SECONDS);
  const clientStateRef = useRef(clientState);
  const checkoutRef = useRef(checkout);
  const thankYouStartedAtRef = useRef<number | null>(null);
  const queuedCheckoutRef = useRef<CfdCheckoutPayload | null>(null);
  clientStateRef.current = clientState;
  checkoutRef.current = checkout;

  const applyCheckout = useCallback((payload: CfdCheckoutPayload) => {
    queuedCheckoutRef.current = null;
    thankYouStartedAtRef.current = null;
    setCheckout(payload);
    setClientState("checkout");
  }, []);

  const queueOrApplyCheckout = useCallback(
    (payload: CfdCheckoutPayload) => {
      const onThankYou = clientStateRef.current === "thankyou";
      if (onThankYou && payload.deferIfThankYou) {
        const started = thankYouStartedAtRef.current ?? Date.now();
        thankYouStartedAtRef.current = started;
        const elapsedSec = (Date.now() - started) / 1000;
        if (elapsedSec < MIN_THANK_YOU_BEFORE_NEXT_SECONDS) {
          queuedCheckoutRef.current = payload;
          return;
        }
      }
      applyCheckout(payload);
    },
    [applyCheckout],
  );

  useEffect(() => {
    if (!enabled) {
      setClientState("idle");
      setCheckout(null);
      return;
    }

    let cancelled = false;

    const handlers = {
      onStartCheckout: (payload: CfdCheckoutPayload) => {
        queueOrApplyCheckout(payload);
      },
      onPaymentSuccess: (payload?: { tableNumber?: string }) => {
        const showing = checkoutRef.current;
        if (
          clientStateRef.current === "checkout" &&
          showing?.tableNumber &&
          payload?.tableNumber &&
          showing.tableNumber !== payload.tableNumber
        ) {
          return;
        }
        thankYouStartedAtRef.current = Date.now();
        queuedCheckoutRef.current = null;
        setClientState("thankyou");
        setSecondsLeft(THANK_YOU_SECONDS);
      },
      onCancelCheckout: () => {
        queuedCheckoutRef.current = null;
        thankYouStartedAtRef.current = null;
        setCheckout(null);
        setClientState("idle");
      },
    };

    const syncFromStore = async () => {
      const snapshot = await fetchCfdDisplaySnapshot();
      if (!snapshot || cancelled) return;

      if (snapshot.state === "checkout" && snapshot.checkout) {
        const nextFp = checkoutPayloadFingerprint(snapshot.checkout);
        const curFp = checkoutPayloadFingerprint(checkoutRef.current);
        if (clientStateRef.current === "checkout" && nextFp === curFp) return;
        if (clientStateRef.current === "thankyou" && snapshot.checkout.deferIfThankYou) {
          queueOrApplyCheckout(snapshot.checkout);
          return;
        }
      } else if (snapshot.state === "thankyou" && clientStateRef.current === "thankyou") {
        return;
      } else if (snapshot.state === "idle" && clientStateRef.current === "idle") {
        return;
      }

      applyCfdSnapshot(snapshot, {
        ...handlers,
        onStartCheckout: (payload) => queueOrApplyCheckout(payload),
      });
    };

    void syncFromStore();

    const unsubscribe = subscribeCfdEvents({
      ...handlers,
      onResubscribed: () => {
        void syncFromStore();
      },
    });

    const unsubDb = subscribeToPostgresRowChanges(
      "kds-cfd-display-state",
      { event: "*", schema: "public", table: "cfd_display_state" },
      () => {
        void syncFromStore();
      },
    );

    const onVis = () => {
      if (document.visibilityState === "visible") void syncFromStore();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      unsubscribe();
      unsubDb();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, queueOrApplyCheckout]);

  useEffect(() => {
    if (!enabled || clientState !== "thankyou") return;
    setSecondsLeft(THANK_YOU_SECONDS);
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          const queued = queuedCheckoutRef.current;
          if (queued) {
            queueOrApplyCheckout(queued);
            return THANK_YOU_SECONDS;
          }
          void releaseCfdThankYouState();
          thankYouStartedAtRef.current = null;
          setCheckout(null);
          setClientState("idle");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [enabled, clientState, queueOrApplyCheckout]);

  if (!enabled) return <>{children}</>;

  const overlayActive = clientState === "checkout" || clientState === "thankyou";

  return (
    <div className="relative h-[100dvh] overflow-hidden">
      <div
        className={
          overlayActive
            ? "pointer-events-none invisible absolute inset-0"
            : "flex h-full min-h-0 flex-col"
        }
      >
        {children}
      </div>
      {overlayActive ? (
        <div
          data-server-interactive
          className="absolute inset-0 z-40 flex flex-col bg-[#0B0B0C] text-[#f5f2ef]"
        >
          {clientState === "checkout" && checkout ? (
            <KdsCheckoutPanel checkout={checkout} translate={translate} />
          ) : null}
          {clientState === "thankyou" ? (
            <KdsThankYouPanel
              secondsLeft={secondsLeft}
              reviewQrImageUrl={settings.cfdReviewQrImageUrl}
              translate={translate}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
