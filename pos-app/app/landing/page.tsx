import { LandingPageView } from "@/components/landing/landing-page-view";
import { fetchWebsiteContent } from "@/src/lib/website-public";

export default async function LandingPage() {
  const content = await fetchWebsiteContent();
  return <LandingPageView content={content} />;
}
