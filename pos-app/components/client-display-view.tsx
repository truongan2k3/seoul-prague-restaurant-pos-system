"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { AnnouncementMarquee } from "@/components/announcement-marquee";
import { CfdReservationPanel } from "@/components/cfd-reservation-panel";
import { CfdWelcomeOverlay, type CfdWelcomeContent } from "@/components/cfd-welcome-overlay";
import { LanguageSelector } from "@/components/language-selector";
import { ReservationIncomingListener } from "@/components/reservation-incoming-listener";
import {
  applyCfdSnapshot,
  checkoutPayloadFingerprint,
  fetchCfdDisplaySnapshot,
  releaseCfdThankYouState,
  subscribeCfdEvents,
  type CfdCheckoutPayload,
  type CfdClientState,
  type CfdWelcomePayload,
} from "@/lib/cfd-display";
import { subscribeToPostgresRowChanges } from "@/lib/realtime-subscribe";
import {
  cfdSlideshowItemDuration,
  resolveCfdSlideshow,
} from "@/lib/cfd-slideshow";
import { formatCzk } from "@/lib/checkout-calculations";
import { t, type TranslationKey } from "@/lib/i18n/translations";
import type { CfdSlideshowItem, LanguageCode } from "@/lib/types";
import { LandingImage } from "@/lib/website/landing-image";
import type { WebsiteContent } from "@/lib/website/types";
import { useSettings } from "@/contexts/settings-context";
import { useBlobUrl, useBlobUrlCache } from "@/hooks/use-blob-url-cache";
import { playCfdWelcomeSound, unlockNotificationAudio } from "@/lib/notification-sound";

const THANK_YOU_SECONDS = 20;
/** Minimum thank-you time before advancing to the next split guest. */
const MIN_THANK_YOU_BEFORE_NEXT_SECONDS = 5;
const CFD_LANGUAGE_KEY = "cfd-language";
const SWIPE_EDGE_PX = 36;
const SWIPE_OPEN_PX = 72;
const SWIPE_CLOSE_PX = 64;

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
    return <span className="text-sm text-white/40">&nbsp;</span>;
  }

  const datePart = now.toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timePart = now.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: language === "en",
  });

  return (
    <time
      dateTime={now.toISOString()}
      className="flex flex-col items-end gap-0.5 text-right leading-tight"
    >
      <span className="text-[11px] font-medium text-white/55 sm:text-xs">{datePart}</span>
      <span className="text-sm font-semibold tabular-nums text-white/85 sm:text-base">{timePart}</span>
    </time>
  );
}

function CfdHeader({
  language,
  onLanguageChange,
  translate,
  logoUrl,
  restaurantName,
}: {
  language: LanguageCode;
  onLanguageChange: (code: LanguageCode) => void;
  translate: (key: TranslationKey) => string;
  logoUrl?: string;
  restaurantName: string;
}) {
  return (
    <header className="z-20 flex shrink-0 items-center gap-3 border-b border-white/10 bg-[#0B0B0C]/95 px-4 py-3 backdrop-blur-md sm:gap-4 sm:px-6 sm:py-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {logoUrl ? (
          <LandingImage
            src={logoUrl}
            alt={restaurantName}
            width={44}
            height={44}
            sizes="44px"
            quality={80}
            priority
            className="h-10 w-10 shrink-0 object-contain sm:h-11 sm:w-11"
          />
        ) : null}
        <div className="min-w-0">
          <p className="landing-serif text-lg leading-tight text-[#F5EDE4] sm:text-2xl">
            {restaurantName}
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.28em] text-[#C9A88B]">
            {translate("cfdWelcome")}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
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
  const isSplitSelect = checkout.mode === "split-select";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0B0B0C]">
      <div className="shrink-0 border-b border-white/10 bg-[#0B0B0C] px-4 py-4 sm:px-6">
        <p className="landing-serif text-2xl text-[#F5EDE4] sm:text-3xl">
          {translate("table")}: {checkout.tableNumber}
        </p>
        {isSplitSelect ? (
          <div className="mt-3 border border-[#C9A88B]/35 bg-[#8B1E2D]/20 px-4 py-3">
            <p className="text-lg font-semibold text-[#E8D5C4] sm:text-xl">
              {translate("cfdPleaseSelectItems")}
            </p>
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
                <th className="hidden px-4 py-3 text-right sm:table-cell">{translate("cfdUnit")}</th>
                <th className="px-4 py-3 text-right">{translate("total")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {checkout.items.map((item, index) => (
                <tr key={`${item.name}-${index}`} className="text-[#F5EDE4]">
                  <td className="px-4 py-4 text-center text-2xl font-semibold tabular-nums text-[#C9A88B] sm:text-3xl">
                    {item.quantity}
                  </td>
                  <td className="px-4 py-4 text-lg font-medium leading-snug sm:text-xl">{item.name}</td>
                  <td className="hidden px-4 py-4 text-right text-lg tabular-nums text-white/50 sm:table-cell">
                    {formatCzk(item.unitPrice)}
                  </td>
                  <td className="px-4 py-4 text-right text-xl font-semibold tabular-nums sm:text-2xl">
                    {formatCzk(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <footer className="shrink-0 border-t border-white/10 bg-[#121214] px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-2 text-lg text-white/65">
          {!isSplitSelect && (
            <>
              <div className="flex justify-between">
                <span>{translate("subtotal")}</span>
                <span className="tabular-nums">{formatCzk(checkout.subtotal)}</span>
              </div>
              {checkout.discount > 0 && (
                <div className="flex justify-between text-[#C9A88B]">
                  <span>{translate("discount")}</span>
                  <span className="tabular-nums">−{formatCzk(checkout.discount)}</span>
                </div>
              )}
              {checkout.tip > 0 && (
                <div className="flex justify-between text-[#E8D5C4]">
                  <span>{translate("tip")}</span>
                  <span className="tabular-nums">{formatCzk(checkout.tip)}</span>
                </div>
              )}
            </>
          )}
          <div className="flex items-end justify-between border-t border-white/10 pt-3">
            <span className="text-xl font-semibold uppercase tracking-wide text-white">
              {translate("total")}
            </span>
            <span className="text-4xl font-black tabular-nums text-[#F5EDE4] sm:text-5xl">
              {formatCzk(displayTotal)} CZK
            </span>
          </div>
          {!isSplitSelect && checkout.amountGiven != null && checkout.amountGiven > 0 && (
            <div className="flex justify-between pt-1 text-white/45">
              <span>{translate("amountGiven")}</span>
              <span className="tabular-nums">{formatCzk(checkout.amountGiven)}</span>
            </div>
          )}
          {!isSplitSelect && checkout.changeDue != null && checkout.changeDue > 0 && (
            <div className="mt-3 flex items-end justify-between border border-[#C9A88B]/45 bg-[#C9A88B]/10 px-4 py-4">
              <span className="text-lg font-semibold uppercase tracking-wide text-[#E8D5C4] sm:text-xl">
                {translate("changeDue")}
              </span>
              <span className="text-4xl font-black tabular-nums text-[#F5EDE4] sm:text-5xl">
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
  logoUrl,
  restaurantName,
}: {
  secondsLeft: number;
  reviewQrImageUrl: string;
  hasAdVideo: boolean;
  translate: (key: TranslationKey) => string;
  logoUrl?: string;
  restaurantName: string;
}) {
  const hasQr = reviewQrImageUrl.trim().length > 0;
  const qrBlobSrc = useBlobUrl(reviewQrImageUrl);
  const qrSrc = qrBlobSrc || reviewQrImageUrl;
  const countdownKey = hasAdVideo ? "cfdVideoIn" : "cfdReturningIn";
  const countdownText = translate(countdownKey).replace("{seconds}", String(secondsLeft));

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10 text-center">
      {logoUrl ? (
        <LandingImage
          src={logoUrl}
          alt={restaurantName}
          width={72}
          height={72}
          sizes="72px"
          quality={80}
          className="mb-6 h-16 w-16 object-contain opacity-95"
        />
      ) : null}
      <h2 className="landing-serif text-3xl text-[#F5EDE4] sm:text-4xl">{translate("cfdThankYou")}</h2>
      <p className="mt-4 max-w-xl text-lg text-white/60 sm:text-xl">{translate("cfdReviewPrompt")}</p>
      <p className="mt-6 text-3xl tracking-[0.35em] text-[#C9A88B]" aria-label="5 star rating">
        ★★★★★
      </p>
      {hasQr && (
        <>
          <div className="mt-8 border border-white/15 bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSrc}
              alt={translate("cfdScanReview")}
              width={220}
              height={220}
              className="h-[220px] w-[220px] object-contain"
            />
          </div>
          <p className="mt-4 text-sm text-white/40">{translate("cfdScanReview")}</p>
        </>
      )}
      <p className="mt-8 text-xs uppercase tracking-[0.18em] text-white/30">{countdownText}</p>
    </div>
  );
}

function CfdSlideshowPlayer({
  items,
  active = true,
}: {
  items: CfdSlideshowItem[];
  /** False while CFD shows checkout/thank-you — keep mounted but pause media. */
  active?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const item = items[Math.max(0, index % Math.max(items.length, 1))];
  const mediaClass = "max-h-full max-w-full object-contain";
  const singleItem = items.length <= 1;
  // Prefetch only active + next clip — avoid downloading the whole playlist on idle.
  const prefetchUrls = useMemo(() => {
    if (items.length === 0) return [] as string[];
    const activeUrl = items[Math.max(0, index % items.length)]?.url;
    const nextUrl = items[(index + 1) % items.length]?.url;
    return [activeUrl, nextUrl].filter((url): url is string => Boolean(url?.trim()));
  }, [items, index]);
  const blobUrls = useBlobUrlCache(prefetchUrls);
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
    if (!active) return;
    if (!item || item.type === "video") return;
    // Single still/GIF stays on screen — remounting used to re-download every N seconds.
    if (singleItem) return;

    const ms = cfdSlideshowItemDuration(item) * 1000;
    const timer = window.setTimeout(() => {
      goNext();
    }, ms);
    return () => window.clearTimeout(timer);
  }, [index, item, goNext, singleItem, active]);

  // Play active video by URL ref — never index DOM video nodes (sparse when images mix in).
  useEffect(() => {
    const activeUrl = items[index % Math.max(items.length, 1)]?.url;
    for (const [url, node] of videoRefs.current) {
      if (active && url === activeUrl) {
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
        if (!active) continue;
        try {
          node.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
    }
  }, [index, items, blobUrls, active]);

  if (!item) {
    return null;
  }

  const currentSrc = resolveSrc(item.url);
  const waitingForMedia = !currentSrc;

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0B0B0C] px-4 py-4 sm:px-6 sm:py-6">
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden border border-white/10 bg-black">
        {waitingForMedia && (
          <p className="absolute inset-0 z-20 flex items-center justify-center text-sm text-white/40">
            Loading…
          </p>
        )}
        {items.map((entry, entryIndex) => {
          const slideActive = entryIndex === index % items.length;
          const nextIndex = (index + 1) % items.length;
          // Keep only active + next in the DOM — avoids decoding every playlist clip.
          if (!slideActive && entryIndex !== nextIndex) return null;
          const hiddenClass = slideActive
            ? "relative z-10 opacity-100"
            : "pointer-events-none absolute inset-0 opacity-0";
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
                autoPlay={slideActive}
                loop={singleItem}
                preload={slideActive ? "auto" : "metadata"}
                onEnded={singleItem ? undefined : slideActive ? goNext : undefined}
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
              loading={slideActive ? "eager" : "lazy"}
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
  active = true,
  logoUrl,
  restaurantName,
}: {
  slides: CfdSlideshowItem[];
  translate: (key: TranslationKey) => string;
  active?: boolean;
  logoUrl?: string;
  restaurantName: string;
}) {
  if (slides.length > 0) {
    return <CfdSlideshowPlayer items={slides} active={active} />;
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[#0B0B0C] px-6 text-center">
      {logoUrl ? (
        <LandingImage
          src={logoUrl}
          alt={restaurantName}
          width={112}
          height={112}
          sizes="112px"
          quality={80}
          className="mb-6 h-24 w-24 object-contain sm:h-28 sm:w-28"
        />
      ) : null}
      <p className="landing-serif text-3xl text-[#F5EDE4] sm:text-4xl">{restaurantName}</p>
      <p className="mt-4 text-xs uppercase tracking-[0.3em] text-[#C9A88B]">{translate("cfdWelcome")}</p>
    </main>
  );
}

export function ClientDisplayView({
  logoUrl,
  restaurantName = "SEOUL PRAGUE",
  website,
}: {
  logoUrl?: string;
  restaurantName?: string;
  website?: WebsiteContent;
} = {}) {
  const { settings } = useSettings();
  const { language, setLanguage, translate } = useCfdLanguage();
  const [clientState, setClientState] = useState<CfdClientState>("idle");
  const [checkout, setCheckout] = useState<CfdCheckoutPayload | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(THANK_YOU_SECONDS);
  const [panelOpen, setPanelOpen] = useState(false);
  const [welcome, setWelcome] = useState<CfdWelcomeContent | null>(null);
  const clientStateRef = useRef(clientState);
  const checkoutRef = useRef(checkout);
  const thankYouStartedAtRef = useRef<number | null>(null);
  const queuedCheckoutRef = useRef<CfdCheckoutPayload | null>(null);
  const welcomedIdsRef = useRef<Set<string>>(new Set());
  const welcomeActiveRef = useRef(false);
  const touchRef = useRef<{ x: number; y: number; tracking: boolean } | null>(null);
  clientStateRef.current = clientState;
  checkoutRef.current = checkout;

  const slideshow = useMemo(() => resolveCfdSlideshow(settings), [settings]);
  const reviewQrImageUrl = settings.cfdReviewQrImageUrl.trim();
  const brandName = restaurantName.trim() || "SEOUL PRAGUE";

  const applyCheckout = useCallback((payload: CfdCheckoutPayload) => {
    queuedCheckoutRef.current = null;
    thankYouStartedAtRef.current = null;
    setPanelOpen(false);
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

  const showWelcome = useCallback((payload: CfdWelcomePayload) => {
    if (!payload.reservationId || !payload.guestName?.trim()) return;
    if (welcomedIdsRef.current.has(payload.reservationId)) return;
    if (welcomeActiveRef.current) return;
    welcomedIdsRef.current.add(payload.reservationId);
    welcomeActiveRef.current = true;
    setPanelOpen(false);
    unlockNotificationAudio();
    playCfdWelcomeSound(settings.soundConfigs.cfdWelcome);
    setWelcome({
      guestName: payload.guestName.trim(),
      isReturning: Boolean(payload.isReturning),
      tableLabel: payload.tableLabel,
    });
  }, [settings.soundConfigs.cfdWelcome]);

  const clearWelcome = useCallback(() => {
    welcomeActiveRef.current = false;
    setWelcome(null);
  }, []);

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
        setPanelOpen(false);
        setClientState("thankyou");
        setSecondsLeft(THANK_YOU_SECONDS);
      },
      onCancelCheckout: () => {
        queuedCheckoutRef.current = null;
        thankYouStartedAtRef.current = null;
        setCheckout(null);
        setClientState("idle");
      },
      onGuestWelcome: (payload: CfdWelcomePayload) => {
        showWelcome(payload);
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
  }, [queueOrApplyCheckout, showWelcome]);

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

  // Hidden gesture: swipe from left edge → open panel; swipe left on panel → close.
  // Only while idle (main content / video). No visible Reservation button.
  const onTouchStart = (event: TouchEvent) => {
    unlockNotificationAudio();
    if (welcome || clientState !== "idle") return;
    const touch = event.touches[0];
    if (!touch) return;
    const fromEdge = touch.clientX <= SWIPE_EDGE_PX;
    if (!panelOpen && !fromEdge) {
      touchRef.current = null;
      return;
    }
    touchRef.current = { x: touch.clientX, y: touch.clientY, tracking: true };
  };

  const onTouchEnd = (event: TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start?.tracking || welcome || clientState !== "idle") return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - start.x;
    const dy = Math.abs(touch.clientY - start.y);
    if (dy > Math.abs(dx) * 0.85) return;
    if (!panelOpen && dx >= SWIPE_OPEN_PX) {
      setPanelOpen(true);
      return;
    }
    if (panelOpen && dx <= -SWIPE_CLOSE_PX) {
      setPanelOpen(false);
    }
  };

  const slideshowActive = clientState === "idle" && !welcome;

  return (
    <div
      className="landing-theme relative flex h-[100dvh] flex-col overflow-hidden bg-[#0B0B0C] text-white"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <AnnouncementMarquee surface="client" tone="dark" />
      <CfdHeader
        language={language}
        onLanguageChange={setLanguage}
        translate={translate}
        logoUrl={logoUrl}
        restaurantName={brandName}
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <CfdReservationPanel
          open={panelOpen && clientState === "idle" && !welcome}
          onClose={() => setPanelOpen(false)}
          language={language}
          onWelcome={showWelcome}
          website={website}
        />

        <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* Keep idle slideshow mounted (hidden) so checkout cycles never remount/re-fetch media. */}
          <div
            className={
              clientState === "idle"
                ? "flex min-h-0 flex-1 flex-col overflow-hidden"
                : "pointer-events-none invisible absolute h-0 w-0 overflow-hidden"
            }
            aria-hidden={clientState !== "idle"}
          >
            <IdleDisplayView
              slides={slideshow}
              translate={translate}
              active={slideshowActive}
              logoUrl={logoUrl}
              restaurantName={brandName}
            />
          </div>

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
                logoUrl={logoUrl}
                restaurantName={brandName}
              />
            </main>
          )}
        </div>
      </div>

      {welcome ? (
        <CfdWelcomeOverlay
          content={welcome}
          logoUrl={logoUrl}
          restaurantName={brandName}
          onDone={clearWelcome}
        />
      ) : null}

      {/* Same reservation popup + looping sound as main POS; sync via realtime Confirm. */}
      <ReservationIncomingListener enableLateMarker={false} />
    </div>
  );
}
