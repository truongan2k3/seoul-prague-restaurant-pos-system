import { LandingPageView } from "@/components/landing/landing-page-view";
import { fetchWebsiteContent } from "@/src/lib/website-public";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LandingPage() {
  const content = await fetchWebsiteContent();
  return <LandingPageView content={content} />;
}
