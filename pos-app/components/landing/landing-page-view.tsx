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
import {
  LandingCustomCta,
  LandingCustomText,
  LandingSpacer,
} from "@/components/landing/landing-custom-blocks";
import { LandingPromoSlideshow } from "@/components/landing/landing-promo-slideshow";
import {
  normalizePageLayout,
  sectionVisibilityClass,
} from "@/lib/website/page-layout";
import type { WebsiteContent, WebsitePageSection } from "@/lib/website/types";

interface LandingPageViewProps {
  content: WebsiteContent;
}

function SectionShell({
  section,
  children,
}: {
  section: WebsitePageSection;
  children: React.ReactNode;
}) {
  const visibility = sectionVisibilityClass(section);
  if (!visibility) return <>{children}</>;
  return <div className={visibility}>{children}</div>;
}

function renderSection(content: WebsiteContent, section: WebsitePageSection) {
  if (!section.enabled) return null;

  switch (section.type) {
    case "hero":
      return (
        <SectionShell key={section.id} section={section}>
          <LandingHero content={content} />
        </SectionShell>
      );
    case "promo_slideshow":
      return <LandingPromoSlideshow key={section.id} content={content} section={section} />;
    case "about":
      return (
        <SectionShell key={section.id} section={section}>
          <LandingAbout content={content} />
        </SectionShell>
      );
    case "signature":
      return (
        <SectionShell key={section.id} section={section}>
          <LandingSignature content={content} />
        </SectionShell>
      );
    case "experience":
      return (
        <SectionShell key={section.id} section={section}>
          <LandingExperience section={section} />
        </SectionShell>
      );
    case "menu":
      return (
        <SectionShell key={section.id} section={section}>
          <LandingMenuPreview content={content} />
        </SectionShell>
      );
    case "gallery":
      return (
        <SectionShell key={section.id} section={section}>
          <LandingGallery content={content} />
        </SectionShell>
      );
    case "video":
      return (
        <SectionShell key={section.id} section={section}>
          <LandingVideo content={content} />
        </SectionShell>
      );
    case "amenities":
      return (
        <SectionShell key={section.id} section={section}>
          <LandingAmenities content={content} />
        </SectionShell>
      );
    case "contact":
      return (
        <SectionShell key={section.id} section={section}>
          <LandingContact content={content} />
        </SectionShell>
      );
    case "custom_text":
      return <LandingCustomText key={section.id} section={section} />;
    case "custom_cta":
      return <LandingCustomCta key={section.id} section={section} />;
    case "spacer":
      return <LandingSpacer key={section.id} section={section} />;
    default:
      return null;
  }
}

export function LandingPageView({ content }: LandingPageViewProps) {
  const layout = normalizePageLayout(content.settings.pageLayout);

  return (
    <div className="landing-theme min-h-screen bg-[#0B0B0C] text-white">
      <LandingNavbar content={content} />
      <main>{layout.map((section) => renderSection(content, section))}</main>
      <LandingFooter content={content} />
    </div>
  );
}
