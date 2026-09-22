import type { Metadata } from "next";
import { LandingSpecialEventPageView } from "@/components/landing/landing-special-event-page";
import { fetchWebsiteContent } from "@/src/lib/website-public";

/** ISR — admin saves call revalidatePath("/special-event"). */
export const revalidate = 120;

export async function generateMetadata(): Promise<Metadata> {
  const content = await fetchWebsiteContent();
  return {
    title: `Special Event — ${content.settings.restaurantName}`,
    description: `Special events and promotions at ${content.settings.restaurantName}.`,
    alternates: { canonical: "/special-event" },
  };
}

export default async function SpecialEventPage() {
  const content = await fetchWebsiteContent();
  return <LandingSpecialEventPageView content={content} />;
}
