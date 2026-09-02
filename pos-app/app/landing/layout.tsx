import type { Metadata } from "next";
import { fetchWebsiteContent } from "@/src/lib/website-public";
import { buildRestaurantJsonLd } from "@/lib/website/seo";

export async function generateMetadata(): Promise<Metadata> {
  const content = await fetchWebsiteContent();
  const { settings } = content;
  const title = settings.seoTitle || settings.restaurantName;
  const description = settings.seoDescription || settings.description;
  const ogImage = settings.seoOgImageUrl || content.media.hero_image?.fileUrl || undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
    alternates: {
      canonical: "/landing",
    },
  };
}

export default async function LandingLayout({ children }: { children: React.ReactNode }) {
  const content = await fetchWebsiteContent();
  const jsonLd = buildRestaurantJsonLd(content);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
