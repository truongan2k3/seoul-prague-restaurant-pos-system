import { Suspense } from "react";
import type { Metadata } from "next";
import { ReservationLandingShell } from "@/components/landing/reservation-landing-shell";
import { ReservationManageView } from "@/components/reservation-manage-view";
import { fetchWebsiteContent } from "@/src/lib/website-public";

export const revalidate = 120;

export async function generateMetadata(): Promise<Metadata> {
  const content = await fetchWebsiteContent();
  return {
    title: `Manage reservation — ${content.settings.restaurantName}`,
    robots: { index: false, follow: false },
  };
}

export default async function ReservationManagePage() {
  const content = await fetchWebsiteContent();
  return (
    <ReservationLandingShell content={content}>
      <Suspense
        fallback={
          <div className="flex min-h-[50vh] items-center justify-center text-sm text-white/50">
            Loading…
          </div>
        }
      >
        <ReservationManageView website={content} />
      </Suspense>
    </ReservationLandingShell>
  );
}
