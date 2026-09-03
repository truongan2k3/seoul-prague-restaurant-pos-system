import type { Metadata } from "next";
import { LandingPageView } from "@/components/landing/landing-page-view";
import { buildRestaurantJsonLd } from "@/lib/website/seo";
import { fetchWebsiteContent } from "@/src/lib/website-public";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
      canonical: "/",
    },
  };
}

export default async function HomePage() {
  const content = await fetchWebsiteContent();
  const jsonLd = buildRestaurantJsonLd(content);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPageView content={content} />
    </>
  );
}
