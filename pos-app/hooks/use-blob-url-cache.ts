"use client";

import { useEffect, useState } from "react";

function uniqueNonEmptyUrls(urls: string[]) {
  return [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
}

/**
 * Download Storage URLs once per page session and expose blob: URLs so slideshow
 * loops never re-hit the Supabase CDN (cached egress stays at one fetch per file).
 */
export function useBlobUrlCache(urls: string[]) {
  const urlsKey = uniqueNonEmptyUrls(urls).join("|");
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const uniqueUrls = uniqueNonEmptyUrls(urls);
    if (typeof window === "undefined" || uniqueUrls.length === 0) {
      setBlobUrls({});
      return;
    }

    let cancelled = false;
    const created: string[] = [];

    void (async () => {
      for (const url of uniqueUrls) {
        if (cancelled) break;
        try {
          const response = await fetch(url);
          if (!response.ok) {
            setBlobUrls((current) => ({ ...current, [url]: url }));
            continue;
          }
          const blob = await response.blob();
          if (cancelled) break;
          const blobUrl = URL.createObjectURL(blob);
          created.push(blobUrl);
          setBlobUrls((current) => ({ ...current, [url]: blobUrl }));
        } catch {
          setBlobUrls((current) => ({ ...current, [url]: url }));
        }
      }
    })();

    return () => {
      cancelled = true;
      for (const blobUrl of created) {
        URL.revokeObjectURL(blobUrl);
      }
      setBlobUrls({});
    };
  }, [urlsKey]);

  return blobUrls;
}

export function useBlobUrl(url: string) {
  const trimmed = url.trim();
  const blobUrls = useBlobUrlCache(trimmed ? [trimmed] : []);
  return trimmed ? blobUrls[trimmed] ?? "" : "";
}
