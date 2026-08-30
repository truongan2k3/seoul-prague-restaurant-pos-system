"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnnouncementMarquee } from "@/components/announcement-marquee";
import { LanguageSelector } from "@/components/language-selector";
import {
  applyCfdSnapshot,
  checkoutPayloadFingerprint,
  fetchCfdDisplaySnapshot,
  releaseCfdThankYouState,
  subscribeCfdEvents,
  type CfdCheckoutPayload,
  type CfdClientState,
} from "@/lib/cfd-display";
import { subscribeToPostgresRowChanges } from "@/lib/realtime-subscribe";
import {
  cfdSlideshowItemDuration,
  resolveCfdSlideshow,
} from "@/lib/cfd-slideshow";
import { formatCzk } from "@/lib/checkout-calculations";
import { t, type TranslationKey } from "@/lib/i18n/translations";
import type { CfdSlideshowItem, LanguageCode } from "@/lib/types";
import { useSettings } from "@/contexts/settings-context";
import { useBlobUrl, useBlobUrlCache } from "@/hooks/use-blob-url-cache";

const THANK_YOU_SECONDS = 20;
/** Minimum thank-you time before advancing to the next split guest. */
const MIN_THANK_YOU_BEFORE_NEXT_SECONDS = 5;
const CFD_LANGUAGE_KEY = "cfd-language";

function useCfdLanguage() {
  const [language, setLanguageState] = useState<LanguageCode>("en");

  useEffect(() => {
    const stored = localStorage.getItem(CFD_LANGUAGE_KEY);
    if (stored === "en" || stored === "cs" || stored === "zh") {
      setLanguageState(stored);
    }
  }, []);

  const setLanguage = useCallback((code: LanguageCode) => {
    setLanguageState(code);
    localStorage.setItem(CFD_LANGUAGE_KEY, code);
  }, []);

  const translate = useCallback(
    (key: TranslationKey) => t(language, key),
    [language],
  );

  return { language, setLanguage, translate };
}

function CfdClock({ language }: { language: LanguageCode }) {
  const [now, setNow] = useState<Date | null>(null);
  const locale = language === "cs" ? "cs-CZ" : language === "zh" ? "zh-CN" : "en-US";

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!now) {
    return <span className="text-sm text-zinc-400">&nbsp;</span>;
  }

  const datePart = now.toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timePart = now.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: language === "en",
  });

  return (
    <time dateTime={now.toISOString()} className="text-right text-sm font-medium text-zinc-300 sm:text-base">
      {datePart} - {timePart}
    </time>
  );
}

function CfdHeader({
  language,
  onLanguageChange,
  translate,
}: {
  language: LanguageCode;
  onLanguageChange: (code: LanguageCode) => void;
  translate: (key: TranslationKey) => string;
}) {
  return (
    <header className="z-20 flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-4 sm:gap-4 sm:px-6">
      <div className="min-w-0">
        <p className="truncate text-xl font-bold tracking-[0.2em] text-white sm:text-2xl">SEOUL PRAGUE</p>
        <p className="mt-0.5 text-xs uppercase tracking-widest text-zinc-500">{translate("cfdWelcome")}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <LanguageSelector
          variant="flag-menu"
          tone="dark"
          language={language}
          onLanguageChange={onLanguageChange}
        />
        <CfdClock language={language} />
      </div>
    </header>
  );
}

function CheckoutView({
  checkout,
  translate,
}: {
  checkout: CfdCheckoutPayload;
  translate: (key: TranslationKey) => string;
}) {
  const displayTotal = checkout.total ?? checkout.amountDueNow;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/95 px-4 py-4 sm:px-6">
        <p className="text-2xl font-bold text-white sm:text-3xl">
          {translate("table")}: {checkout.tableNumber}
        </p>
        <p className="mt-1 text-sm font-semibold uppercase tracking-widest text-zinc-400">
          {translate("orderDetails")}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
        <div className="overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900">
          <table className="w-full text-left">
            <thead className="sticky top-0 z-10 bg-zinc-800 text-xs font-bold uppercase tracking-wider text-zinc-300">
              <tr>
                <th className="px-4 py-3 text-center">{translate("cfdQty")}</th>
                <th className="px-4 py-3">{translate("itemName")}</th>
                <th className="hidden px-4 py-3 text-right sm:table-cell">{translate("cfdUnit")}</th>
                <th className="px-4 py-3 text-right">{translate("total")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {checkout.items.map((item, index) => (
                <tr key={`${item.name}-${index}`} className="text-white">
                  <td className="px-4 py-4 text-center text-2xl font-bold tabular-nums sm:text-3xl">
                    {item.quantity}
                  </td>
                  <td className="px-4 py-4 text-lg font-semibold leading-snug sm:text-xl">{item.name}</td>
                  <td className="hidden px-4 py-4 text-right text-lg tabular-nums text-zinc-300 sm:table-cell">
                    {formatCzk(item.unitPrice)}
                  </td>
                  <td className="px-4 py-4 text-right text-xl font-bold tabular-nums sm:text-2xl">
                    {formatCzk(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <footer className="shrink-0 border-t border-zinc-700 bg-zinc-900 px-4 py-5 shadow-[0_-8px_24px_rgba(0,0,0,0.35)] sm:px-6">
        <div className="mx-auto max-w-3xl space-y-2 text-lg text-zinc-300">
          <div className="flex justify-between">
            <span>{translate("subtotal")}</span>
            <span className="tabular-nums">{formatCzk(checkout.subtotal)}</span>
          </div>
          {checkout.discount > 0 && (
            <div className="flex justify-between text-orange-300">
              <span>{translate("discount")}</span>
              <span className="tabular-nums">−{formatCzk(checkout.discount)}</span>
            </div>
          )}
          {checkout.tip > 0 && (
            <div className="flex justify-between text-emerald-300">
              <span>{translate("tip")}</span>
              <span className="tabular-nums">{formatCzk(checkout.tip)}</span>
            </div>
          )}
          <div className="flex items-end justify-between border-t border-zinc-700 pt-3">
            <span className="text-xl font-bold uppercase tracking-wide text-white">{translate("total")}</span>
            <span className="text-4xl font-black tabular-nums text-white sm:text-5xl">
              {formatCzk(displayTotal)} CZK
            </span>
          </div>
          {checkout.amountGiven != null && checkout.amountGiven > 0 && (
            <div className="flex justify-between pt-1 text-zinc-400">
              <span>{translate("amountGiven")}</span>
              <span className="tabular-nums">{formatCzk(checkout.amountGiven)}</span>
            </div>
          )}
          {checkout.changeDue != null && checkout.changeDue > 0 && (
            <div className="mt-3 flex items-end justify-between rounded-2xl border-2 border-amber-500/60 bg-amber-500/10 px-4 py-4">
              <span className="text-lg font-bold uppercase tracking-wide text-amber-200 sm:text-xl">
                {translate("changeDue")}
              </span>
              <span className="text-4xl font-black tabular-nums text-amber-300 sm:text-5xl">
                {formatCzk(checkout.changeDue)} CZK
              </span>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

function ThankYouView({
  secondsLeft,
  reviewQrImageUrl,
  hasAdVideo,
  translate,
}: {
  secondsLeft: number;
  reviewQrImageUrl: string;
  hasAdVideo: boolean;
  translate: (key: TranslationKey) => string;
}) {
  const hasQr = reviewQrImageUrl.trim().length > 0;
  const qrBlobSrc = useBlobUrl(reviewQrImageUrl);
  const qrSrc = qrBlobSrc || reviewQrImageUrl;
  const countdownKey = hasAdVideo ? "cfdVideoIn" : "cfdReturningIn";
  const countdownText = translate(countdownKey).replace("{seconds}", String(secondsLeft));

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10 text-center">
      <h2 className="text-3xl font-bold text-white sm:text-4xl">{translate("cfdThankYou")}</h2>
      <p className="mt-4 max-w-xl text-lg text-zinc-300 sm:text-xl">{translate("cfdReviewPrompt")}</p>
      <p className="mt-6 text-4xl tracking-widest text-amber-400" aria-label="5 star rating">
        ⭐⭐⭐⭐⭐
      </p>
      {hasQr && (
        <>
          <div className="mt-8 rounded-2xl bg-white p-4 shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSrc}
              alt={translate("cfdScanReview")}
              width={220}
              height={220}
              className="h-[220px] w-[220px] object-contain"
            />
          </div>
          <p className="mt-4 text-sm text-zinc-500">{translate("cfdScanReview")}</p>
        </>
      )}
      <p className="mt-8 text-xs text-zinc-600">{countdownText}</p>
    </div>
  );
}

function CfdSlideshowPlayer({ items }: { items: CfdSlideshowItem[] }) {
  const [index, setIndex] = useState(0);
  const item = items[Math.max(0, index % Math.max(items.length, 1))];
  const mediaClass = "max-h-full max-w-full object-contain";
  const singleItem = items.length <= 1;
  const blobUrls = useBlobUrlCache(items.map((entry) => entry.url));
  const resolveSrc = useCallback((url: string) => blobUrls[url] ?? "", [blobUrls]);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  // Stable list identity for timers (urls only) — avoid remount/refetch storms.
  const urlsKey = items.map((entry) => entry.url).join("|");

  useEffect(() => {
    setIndex(0);
  }, [urlsKey]);

  const goNext = useCallback(() => {
    if (singleItem) return;
    setIndex((current) => (current + 1) % items.length);
  }, [items.length, singleItem]);

  useEffect(() => {
    if (!item || item.type === "video") return;
    // Single still/GIF stays on screen — remounting used to re-download every N seconds.
    if (singleItem) return;

    const ms = cfdSlideshowItemDuration(item) * 1000;
    const timer = window.setTimeout(() => {
      goNext();
    }, ms);
    return () => window.clearTimeout(timer);
  }, [index, item, goNext, singleItem]);

  // Play active video by URL ref — never index DOM video nodes (sparse when images mix in).
  useEffect(() => {
    const activeUrl = items[index % Math.max(items.length, 1)]?.url;
    for (const [url, node] of videoRefs.current) {
      if (url === activeUrl) {
        const play = () => {
          void node.play().catch(() => undefined);
        };
        if (node.readyState >= 2) {
          play();
        } else {
          node.addEventListener("loadeddata", play, { once: true });
        }
      } else {
        node.pause();
        try {
          node.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
    }
  }, [index, items, blobUrls]);

  if (!item) {
    return null;
  }

  const currentSrc = resolveSrc(item.url);
  const waitingForMedia = !currentSrc;

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-950 px-4 py-4 sm:px-6 sm:py-6">
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-black">
        {waitingForMedia && (
          <p className="absolute inset-0 z-20 flex items-center justify-center text-sm text-zinc-500">
            Loading…
          </p>
        )}
        {items.map((entry, entryIndex) => {
          const active = entryIndex === index % items.length;
          const hiddenClass = active ? "relative z-10 opacity-100" : "pointer-events-none absolute inset-0 opacity-0";
          const src = resolveSrc(entry.url);
          if (!src) return null;
          if (entry.type === "video") {
            return (
              <video
                key={entry.url}
                ref={(node) => {
                  if (node) videoRefs.current.set(entry.url, node);
                  else videoRefs.current.delete(entry.url);
                }}
                src={src}
                muted
                playsInline
                autoPlay={active}
                loop={singleItem}
                preload="auto"
                onEnded={singleItem ? undefined : active ? goNext : undefined}
                className={`${mediaClass} ${hiddenClass}`}
              />
            );
          }
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={entry.url}
              src={src}
              alt="Promotional display"
              decoding="async"
              loading={entryIndex === 0 ? "eager" : "lazy"}
              className={`${mediaClass} ${hiddenClass}`}
            />
          );
        })}
      </div>
    </main>
  );
}

function IdleDisplayView({
  slides,
  translate,
}: {
  slides: CfdSlideshowItem[];
  translate: (key: TranslationKey) => string;
}) {
  if (slides.length > 0) {
    return <CfdSlideshowPlayer items={slides} />;
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col items-center justify-center bg-zinc-950 px-6 text-center">
      <p className="text-3xl font-bold tracking-[0.25em] text-white sm:text-4xl">SEOUL PRAGUE</p>
      <p className="mt-4 text-lg text-zinc-400">{translate("cfdWelcome")}</p>
    </main>
  );
}

export function ClientDisplayView() {
  const { settings } = useSettings();
  const { language, setLanguage, translate } = useCfdLanguage();
  const [clientState, setClientState] = useState<CfdClientState>("idle");
  const [checkout, setCheckout] = useState<CfdCheckoutPayload | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(THANK_YOU_SECONDS);
  const clientStateRef = useRef(clientState);
  const checkoutRef = useRef(checkout);
  const thankYouStartedAtRef = useRef<number | null>(null);
  const queuedCheckoutRef = useRef<CfdCheckoutPayload | null>(null);
  clientStateRef.current = clientState;
  checkoutRef.current = checkout;

  const slideshow = useMemo(() => resolveCfdSlideshow(settings), [settings]);
  const reviewQrImageUrl = settings.cfdReviewQrImageUrl.trim();

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
    const handlers = {
      onStartCheckout: (payload: CfdCheckoutPayload) => {
        queueOrApplyCheckout(payload);
      },
      onPaymentSuccess: (payload?: { tableNumber?: string }) => {
        // Don't let a previous table's payment wipe a newer checkout already on screen.
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
      if (!snapshot) return;

      if (snapshot.state === "checkout" && snapshot.checkout) {
        const nextFp = checkoutPayloadFingerprint(snapshot.checkout);
        const curFp = checkoutPayloadFingerprint(checkoutRef.current);
        if (clientStateRef.current === "checkout" && nextFp === curFp) {
          return;
        }
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

    const unsubState = subscribeToPostgresRowChanges(
      "cfd-display-state",
      { event: "*", schema: "public", table: "cfd_display_state" },
      () => {
        void syncFromStore();
      },
      { debounceMs: 400 },
    );

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void syncFromStore();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      unsubscribe();
      unsubState();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [queueOrApplyCheckout]);

  useEffect(() => {
    if (clientState !== "thankyou") return;

    if (thankYouStartedAtRef.current == null) {
      thankYouStartedAtRef.current = Date.now();
    }
    setSecondsLeft(THANK_YOU_SECONDS);
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        const started = thankYouStartedAtRef.current ?? Date.now();
        const elapsedSec = (Date.now() - started) / 1000;
        const queued = queuedCheckoutRef.current;

        if (queued && elapsedSec >= MIN_THANK_YOU_BEFORE_NEXT_SECONDS) {
          queuedCheckoutRef.current = null;
          thankYouStartedAtRef.current = null;
          setCheckout(queued);
          setClientState("checkout");
          return THANK_YOU_SECONDS;
        }

        if (prev <= 1) {
          if (queued) {
            queuedCheckoutRef.current = null;
            thankYouStartedAtRef.current = null;
            setCheckout(queued);
            setClientState("checkout");
            return THANK_YOU_SECONDS;
          }
          thankYouStartedAtRef.current = null;
          setClientState("idle");
          setCheckout(null);
          void releaseCfdThankYouState();
          return THANK_YOU_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [clientState]);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-zinc-950 text-white">
      <AnnouncementMarquee surface="client" tone="dark" />
      <CfdHeader language={language} onLanguageChange={setLanguage} translate={translate} />

      {clientState === "idle" && <IdleDisplayView slides={slideshow} translate={translate} />}

      {clientState === "checkout" && checkout && (
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <CheckoutView checkout={checkout} translate={translate} />
        </main>
      )}

      {clientState === "thankyou" && (
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ThankYouView
            secondsLeft={secondsLeft}
            reviewQrImageUrl={reviewQrImageUrl}
            hasAdVideo={slideshow.length > 0}
            translate={translate}
          />
        </main>
      )}
    </div>
  );
}
