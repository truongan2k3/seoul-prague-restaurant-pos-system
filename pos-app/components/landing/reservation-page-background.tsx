"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildYouTubeBackgroundEmbedUrl,
  isReservationGifUrl,
  isReservationVideoUrl,
  parseYouTubeVideoId,
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
 * YouTube (when set) is preferred — streams off Supabase Storage.
 * Video/GIF uploads remain as fallback. Decorative only — never blocks the form.
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
  const [shouldLoadYoutube, setShouldLoadYoutube] = useState(preview);

  const active = preview || (config.enabled && reservationBackgroundHasMedia(config));
  const posterUrl = config.posterUrl;
  const objectPosition =
    viewport === "mobile" ? config.objectPositionMobile : config.objectPosition;

  const youtubeId = useMemo(
    () => parseYouTubeVideoId(config.youtubeUrl || ""),
    [config.youtubeUrl],
  );
  const youtubeEmbedUrl = youtubeId ? buildYouTubeBackgroundEmbedUrl(youtubeId) : "";

  const videoSrc = useMemo(() => {
    if (youtubeId) return "";
    if (viewport === "mobile" && config.videoUrlMobile) return config.videoUrlMobile;
    if (config.videoUrl) return config.videoUrl;
    if (config.videoUrlMobile) return config.videoUrlMobile;
    return "";
  }, [config.videoUrl, config.videoUrlMobile, viewport, youtubeId]);

  const useAnimatedGif =
    Boolean(videoSrc) && isReservationGifUrl(videoSrc) && !isReservationVideoUrl(videoSrc);

  const canPlayYoutube = Boolean(youtubeId) && !reducedMotion && !constrained;
  const canPlayVideo =
    Boolean(videoSrc) &&
    isReservationVideoUrl(videoSrc) &&
    !reducedMotion &&
    !constrained &&
    !videoFailed;

  // Lazy-load YouTube / file video after idle so booking UI paints first.
  useEffect(() => {
    if (!active || preview) {
      if (preview) {
        setShouldLoadYoutube(canPlayYoutube);
        setShouldLoadVideo(canPlayVideo);
      }
      return;
    }

    const wantsMedia = canPlayYoutube || canPlayVideo;
    if (!wantsMedia) return;

    let cancelled = false;
    const enable = () => {
      if (cancelled) return;
      if (canPlayYoutube) setShouldLoadYoutube(true);
      if (canPlayVideo) setShouldLoadVideo(true);
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
  }, [active, canPlayVideo, canPlayYoutube, preview, videoSrc, youtubeId]);

  useEffect(() => {
    setVideoFailed(false);
    setShouldLoadVideo(preview);
    setShouldLoadYoutube(preview);
  }, [videoSrc, youtubeId, preview]);

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
      <div className="absolute inset-0 bg-[#0B0B0C]" />

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

      {canPlayYoutube && shouldLoadYoutube ? (
        <div className="absolute inset-0 overflow-hidden">
          {/* Scale past 100% to crop YouTube chrome / letterboxing for a full-bleed look. */}
          <iframe
            title="Reservation background"
            src={youtubeEmbedUrl}
            className="pointer-events-none absolute left-1/2 top-1/2 h-[56.25vw] min-h-full w-[177.78vh] min-w-full -translate-x-1/2 -translate-y-1/2 border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen={false}
            loading="lazy"
            tabIndex={-1}
          />
        </div>
      ) : null}

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
          {videoSrc.toLowerCase().includes(".webm") ? (
            <source src={videoSrc} type="video/webm" />
          ) : null}
          <source
            src={videoSrc}
            type={videoSrc.toLowerCase().includes(".webm") ? "video/webm" : "video/mp4"}
          />
        </video>
      ) : null}

      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, rgba(11,11,12,${overlay * 0.85}) 0%, rgba(11,11,12,${overlay}) 45%, rgba(11,11,12,${Math.min(0.92, overlay + 0.12)}) 100%)`,
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.45)_100%)]" />
    </div>
  );
}
