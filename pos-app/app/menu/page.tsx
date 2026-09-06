import type { Metadata } from "next";
import { LandingMenuPageView } from "@/components/landing/landing-menu-page";
import { fetchWebsiteContent } from "@/src/lib/website-public";

/** ISR — admin saves call revalidatePath("/menu"). */
export const revalidate = 120;

export async function generateMetadata(): Promise<Metadata> {
  const content = await fetchWebsiteContent();
  return {
    title: `Menu — ${content.settings.restaurantName}`,
    description: `Explore the menu at ${content.settings.restaurantName}. Premium Korean BBQ in Prague.`,
    alternates: { canonical: "/menu" },
  };
}

export default async function MenuPage() {
  const content = await fetchWebsiteContent();
  return <LandingMenuPageView content={content} />;
}
