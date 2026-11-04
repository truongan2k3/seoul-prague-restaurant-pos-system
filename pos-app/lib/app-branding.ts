/** Stable app identity; changing a logo only changes the icon URLs. */
export function appBrandingUrls(businessId: string, logoUrl: string) {
  const query = new URLSearchParams({ business: businessId, v: logoUrl });
  return {
    manifest: `/api/app-branding/manifest?${query}`,
    icon: (size: number) => `/api/app-branding/icon?${query}&size=${size}`,
  };
}

export function buildBrandedManifest(business: { id: string; name: string; logoUrl: string }) {
  const urls = appBrandingUrls(business.id, business.logoUrl);
  return {
    id: "/app",
    name: `${business.name} POS`,
    short_name: business.name,
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [192, 512].flatMap(size => ["any", "maskable"].map(purpose => ({
      src: urls.icon(size), sizes: `${size}x${size}`, type: "image/png", purpose,
    }))),
  };
}
