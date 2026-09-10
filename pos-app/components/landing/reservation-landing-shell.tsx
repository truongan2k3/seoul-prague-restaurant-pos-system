import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-menu-gallery";
import { ReservationPageBackground } from "@/components/landing/reservation-page-background";
import type { WebsiteContent } from "@/lib/website/types";

/** Shared landing chrome for guest reservation pages (fonts, logo, footer). */
export function ReservationLandingShell({
  content,
  children,
}: {
  content: WebsiteContent;
  children: React.ReactNode;
}) {
  return (
    <div className="landing-theme relative min-h-screen bg-[#0B0B0C] text-white">
      <ReservationPageBackground config={content.settings.reservationBackground} />
      <div className="relative z-10">
        <LandingNavbar content={content} hideBookCta />
        <div className="pt-24 lg:pt-28">{children}</div>
        <LandingFooter content={content} showBookCta={false} />
      </div>
    </div>
  );
}
