import type { Metadata } from "next";
import { ReservationLandingShell } from "@/components/landing/reservation-landing-shell";
import { ReservationBookingView } from "@/components/reservation-booking-view";
import { fetchWebsiteContent } from "@/src/lib/website-public";

export const revalidate = 120;

export async function generateMetadata(): Promise<Metadata> {
  const content = await fetchWebsiteContent();
  const name = content.settings.restaurantName;
  return {
    title: `Reserve a table — ${name}`,
    description: `Book your table at ${name}. Premium Korean BBQ in Prague.`,
    alternates: { canonical: "/reservation" },
  };
}

export default async function ReservationPage() {
  const content = await fetchWebsiteContent();
  return (
    <ReservationLandingShell content={content}>
      <ReservationBookingView website={content} />
    </ReservationLandingShell>
  );
}
