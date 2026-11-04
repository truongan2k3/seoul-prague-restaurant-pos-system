"use client";

import { useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { appBrandingUrls } from "@/lib/app-branding";

/** Follow the logo in Settings, including an upload without a page reload. */
export function AppBrandingIcons() {
  const { business } = useAuth();
  const businessId = business?.id;
  const logoUrl = business?.logoUrl;

  useEffect(() => {
    if (!businessId || !logoUrl) return;
    const urls = appBrandingUrls(businessId, logoUrl);
    const originals = Array.from(document.head.querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]',
    ));
    originals.forEach(link => link.remove());
    const links = [
      { rel: "icon", href: urls.icon(32), sizes: "32x32", type: "image/png" },
      { rel: "apple-touch-icon", href: urls.icon(180), sizes: "180x180", type: "image/png" },
      { rel: "manifest", href: urls.manifest },
    ].map(attributes => {
      const link = document.createElement("link");
      Object.assign(link, attributes);
      if (attributes.rel === "manifest") link.crossOrigin = "use-credentials";
      document.head.appendChild(link);
      return link;
    });
    return () => {
      links.forEach(link => link.remove());
      originals.forEach(link => document.head.appendChild(link));
    };
  }, [businessId, logoUrl]);

  return null;
}
