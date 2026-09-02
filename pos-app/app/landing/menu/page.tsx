import type { Metadata } from "next";
import { LandingMenuPageView } from "@/components/landing/landing-menu-page";
import { fetchWebsiteContent } from "@/src/lib/website-public";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const content = await fetchWebsiteContent();
  return {
    title: `Menu — ${content.settings.restaurantName}`,
    description: `Explore the menu at ${content.settings.restaurantName}. Premium Korean BBQ in Prague.`,
    alternates: { canonical: "/landing/menu" },
  };
}

export default async function LandingMenuPage() {
  const content = await fetchWebsiteContent();
  return <LandingMenuPageView content={content} />;
}
