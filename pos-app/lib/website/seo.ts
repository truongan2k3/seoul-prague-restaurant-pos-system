import type { WebsiteContent } from "@/lib/website/types";

export function buildRestaurantJsonLd(content: WebsiteContent) {
  const { settings } = content;
  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: settings.restaurantName,
    description: settings.seoDescription || settings.description,
    telephone: settings.phone,
    email: settings.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: settings.address,
    },
    url: "/",
    servesCuisine: "Korean BBQ",
    openingHoursSpecification: settings.openingHours
      .filter((row) => !row.closed)
      .map((row) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: row.day.charAt(0).toUpperCase() + row.day.slice(1),
        opens: row.open,
        closes: row.close,
      })),
  };
}
