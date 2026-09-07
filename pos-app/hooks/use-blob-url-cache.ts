"use client";

import { useEffect, useState } from "react";

function uniqueNonEmptyUrls(urls: string[]) {
  return [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
}

/** Survives React remounts for the lifetime of the tab (CFD checkout ↔ idle). */
const globalBlobBySource = new Map<string, string>();
const inflightBySource = new Map<string, Promise<string>>();

async function resolveBlobUrl(sourceUrl: string): Promise<string> {
  const cached = globalBlobBySource.get(sourceUrl);
  if (cached) return cached;

  const inflight = inflightBySource.get(sourceUrl);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      // Prefer HTTP disk cache when Storage sent cacheControl (1 year on uploads).
      const response = await fetch(sourceUrl, { cache: "force-cache" });
      if (!response.ok) {
        return sourceUrl;
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      globalBlobBySource.set(sourceUrl, blobUrl);
      return blobUrl;
    } catch {
      return sourceUrl;
    } finally {
      inflightBySource.delete(sourceUrl);
    }
  })();

  inflightBySource.set(sourceUrl, promise);
  return promise;
}

/**
 * Resolve Storage URLs to blob: URLs once per browser tab.
 * Survives component remounts so CFD checkout/thank-you cycles do not re-download.
 */
export function useBlobUrlCache(urls: string[]) {
  const uniqueUrls = uniqueNonEmptyUrls(urls);
  const urlsKey = uniqueUrls.join("|");
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const url of uniqueUrls) {
      const cached = globalBlobBySource.get(url);
      if (cached) initial[url] = cached;
    }
    return initial;
  });

  useEffect(() => {
    if (typeof window === "undefined" || uniqueUrls.length === 0) {
      setBlobUrls({});
      return;
    }

    let cancelled = false;

    // Seed from module cache immediately (avoids Loading flash after remount).
    const seeded: Record<string, string> = {};
    for (const url of uniqueUrls) {
      const cached = globalBlobBySource.get(url);
      if (cached) seeded[url] = cached;
    }
    if (Object.keys(seeded).length > 0) {
      setBlobUrls((current) => ({ ...current, ...seeded }));
    }

    void (async () => {
      for (const url of uniqueUrls) {
        if (cancelled) break;
        if (globalBlobBySource.has(url)) continue;
        const resolved = await resolveBlobUrl(url);
        if (cancelled) break;
        setBlobUrls((current) => ({ ...current, [url]: resolved }));
      }
    })();

    return () => {
      cancelled = true;
      // Do not revokeObjectURL — keep tab-lifetime cache for CFD remounts.
    };
  }, [urlsKey]);

  return blobUrls;
}

export function useBlobUrl(url: string) {
  const trimmed = url.trim();
  const blobUrls = useBlobUrlCache(trimmed ? [trimmed] : []);
  return trimmed ? blobUrls[trimmed] ?? "" : "";
}
