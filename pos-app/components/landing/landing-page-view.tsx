import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingHero } from "@/components/landing/landing-hero";
import {
  LandingAbout,
  LandingExperience,
  LandingSignature,
} from "@/components/landing/landing-sections";
import {
  LandingAmenities,
  LandingContact,
  LandingFooter,
  LandingGallery,
  LandingMenuPreview,
  LandingVideo,
} from "@/components/landing/landing-menu-gallery";
import type { WebsiteContent } from "@/lib/website/types";

interface LandingPageViewProps {
  content: WebsiteContent;
}

export function LandingPageView({ content }: LandingPageViewProps) {
  return (
    <div className="landing-theme min-h-screen bg-[#0B0B0C] text-white">
      <LandingNavbar content={content} />
      <main>
        <LandingHero content={content} />
        <LandingAbout content={content} />
        <LandingSignature content={content} />
        <LandingExperience />
        <LandingMenuPreview content={content} />
        <LandingGallery content={content} />
        <LandingVideo content={content} />
        <LandingAmenities content={content} />
        <LandingContact content={content} />
      </main>
      <LandingFooter content={content} />
    </div>
  );
}
