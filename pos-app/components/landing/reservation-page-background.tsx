"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  isReservationGifUrl,
  isReservationVideoUrl,
  reservationBackgroundHasMedia,
} from "@/lib/website/reservation-background";
import type { WebsiteReservationBackground } from "@/lib/website/types";

type Viewport = "mobile" | "desktop";

function useViewportKind(): Viewport {
  const [kind, setKind] = useState<Viewport>("desktop");
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setKind(mq.matches ? "mobile" : "desktop");
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return kind;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

function useSaveDataOrSlow(): boolean {
  const [constrained, setConstrained] = useState(false);
  useEffect(() => {
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    const slow =
      Boolean(connection?.saveData) ||
      connection?.effectiveType === "slow-2g" ||
      connection?.effectiveType === "2g";
    setConstrained(slow);
  }, []);
  return constrained;
}

/**
 * Full-bleed cinematic background for guest reservation pages.
 * Video is decorative only — never blocks the booking form.
 */
export function ReservationPageBackground({
  config,
  preview = false,
}: {
  config: WebsiteReservationBackground;
  /** Force media visible even when disabled (admin preview). */
  preview?: boolean;
}) {
  const viewport = useViewportKind();
  const reducedMotion = usePrefersReducedMotion();
  const constrained = useSaveDataOrSlow();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [shouldLoadVideo, setShouldLoadVideo] = useState(preview);

  const active = preview || (config.enabled && reservationBackgroundHasMedia(config));
  const posterUrl = config.posterUrl;
  const objectPosition =
    viewport === "mobile" ? config.objectPositionMobile : config.objectPosition;

  const videoSrc = useMemo(() => {
    if (viewport === "mobile" && config.videoUrlMobile) return config.videoUrlMobile;
    if (config.videoUrl) return config.videoUrl;
    if (config.videoUrlMobile) return config.videoUrlMobile;
    return "";
  }, [config.videoUrl, config.videoUrlMobile, viewport]);

  const useAnimatedGif =
    Boolean(videoSrc) && isReservationGifUrl(videoSrc) && !isReservationVideoUrl(videoSrc);

  const canPlayVideo =
    Boolean(videoSrc) &&
    isReservationVideoUrl(videoSrc) &&
    !reducedMotion &&
    !constrained &&
    !videoFailed;

  // Lazy-load video after idle / short delay so booking UI paints first.
  useEffect(() => {
    if (!active || !canPlayVideo || preview) {
      if (preview && canPlayVideo) setShouldLoadVideo(true);
      return;
    }
    let cancelled = false;
    const enable = () => {
      if (!cancelled) setShouldLoadVideo(true);
    };
    const idle = (window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    }).requestIdleCallback;
    let idleId: number | undefined;
    let timeoutId: number | undefined;
    if (typeof idle === "function") {
      idleId = idle(enable, { timeout: 1200 });
    } else {
      timeoutId = window.setTimeout(enable, 400);
    }
    return () => {
      cancelled = true;
      if (idleId != null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [active, canPlayVideo, preview, videoSrc]);

  useEffect(() => {
    setVideoFailed(false);
    setShouldLoadVideo(preview);
  }, [videoSrc, preview]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !shouldLoadVideo || !canPlayVideo) return;
    const play = () => {
      void el.play().catch(() => setVideoFailed(true));
    };
    if (el.readyState >= 2) play();
    else el.addEventListener("loadeddata", play, { once: true });
    return () => el.removeEventListener("loadeddata", play);
  }, [shouldLoadVideo, canPlayVideo, videoSrc]);

  if (!active) return null;

  const overlay = Math.min(90, Math.max(0, config.overlayOpacity)) / 100;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      {/* Base fill */}
      <div className="absolute inset-0 bg-[#0B0B0C]" />

      {/* Poster / still — always present for LCP + fallback */}
      {posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={posterUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition }}
          decoding="async"
          fetchPriority={preview ? "high" : "low"}
        />
      ) : null}

      {/* GIF as animated image fallback when admin uploaded GIF instead of video */}
      {useAnimatedGif && !reducedMotion && !constrained ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={videoSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition }}
          decoding="async"
          loading="lazy"
        />
      ) : null}

      {/* Video loop — desktop/mobile sources chosen above; never loads desktop-only on mobile when mobile URL set */}
      {canPlayVideo && shouldLoadVideo ? (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition }}
          muted
          playsInline
          loop
          autoPlay
          preload="metadata"
          poster={posterUrl || undefined}
          controls={false}
          disablePictureInPicture
          onError={() => setVideoFailed(true)}
        >
          {/* Prefer webm when URL is webm; browsers skip unsupported types */}
          {videoSrc.toLowerCase().includes(".webm") ? (
            <source src={videoSrc} type="video/webm" />
          ) : null}
          <source
            src={videoSrc}
            type={videoSrc.toLowerCase().includes(".webm") ? "video/webm" : "video/mp4"}
          />
        </video>
      ) : null}

      {/* Readability overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, rgba(11,11,12,${overlay * 0.85}) 0%, rgba(11,11,12,${overlay}) 45%, rgba(11,11,12,${Math.min(0.92, overlay + 0.12)}) 100%)`,
        }}
      />
      {/* Soft vignette for premium BBQ atmosphere */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.45)_100%)]" />
    </div>
  );
}
