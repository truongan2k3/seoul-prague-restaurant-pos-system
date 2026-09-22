"use client";

import Image from "next/image";
import { useCallback, useState, type CSSProperties } from "react";

function canOptimize(src: string): boolean {
  try {
    const url = new URL(src);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

type LandingImageProps = {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  sizes: string;
  /** Eager-load above-the-fold media (first gallery frames, hero). */
  priority?: boolean;
  quality?: number;
  /** Fixed box (thumbs / icons). */
  width?: number;
  height?: number;
  /** Fill parent — parent must be `position: relative` (or absolute/fixed). */
  fill?: boolean;
  draggable?: boolean;
};

function RawImg({
  src,
  alt,
  className,
  style,
  width,
  height,
  fill,
  draggable,
  sizes,
  priority = false,
}: Omit<LandingImageProps, "quality">) {
  const sizesAttr =
    sizes ??
    (width != null && !fill ? `${width}px` : undefined);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      sizes={sizesAttr}
      className={fill ? `absolute inset-0 h-full w-full ${className ?? ""}` : className}
      style={style}
      draggable={draggable}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "low"}
      decoding="async"
    />
  );
}

/**
 * Landing media via next/image so guests get resized WebP/AVIF from the CDN
 * instead of full-resolution Supabase originals (Storage egress stays low at scale).
 * Falls back to a plain <img> if the optimizer fails.
 */
export function LandingImage({
  src,
  alt,
  className,
  style,
  sizes,
  priority = false,
  quality = 72,
  width,
  height,
  fill = false,
  draggable = false,
}: LandingImageProps) {
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);

  if (!canOptimize(src) || failed) {
    return (
      <RawImg
        src={src}
        alt={alt}
        className={className}
        style={style}
        width={width}
        height={height}
        fill={fill}
        draggable={draggable}
        sizes={sizes}
        priority={priority}
      />
    );
  }

  if (fill) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        quality={quality}
        className={className}
        style={style}
        draggable={draggable}
        onError={onError}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width ?? 96}
      height={height ?? 96}
      sizes={sizes}
      priority={priority}
      quality={quality}
      className={className}
      style={style}
      draggable={draggable}
      onError={onError}
    />
  );
}
