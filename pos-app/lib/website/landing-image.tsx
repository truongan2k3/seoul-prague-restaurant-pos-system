"use client";

import Image from "next/image";
import type { CSSProperties } from "react";

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
  /** Fill parent — parent must be `position: relative`. */
  fill?: boolean;
  draggable?: boolean;
};

/**
 * Landing media via next/image so guests get resized WebP/AVIF from the CDN
 * instead of full-resolution Supabase originals.
 */
export function LandingImage({
  src,
  alt,
  className,
  style,
  sizes,
  priority = false,
  quality = 75,
  width,
  height,
  fill = false,
  draggable = false,
}: LandingImageProps) {
  if (!canOptimize(src)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        width={fill ? undefined : width}
        height={fill ? undefined : height}
        className={fill ? `absolute inset-0 h-full w-full ${className ?? ""}` : className}
        style={style}
        draggable={draggable}
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
    />
  );
}
