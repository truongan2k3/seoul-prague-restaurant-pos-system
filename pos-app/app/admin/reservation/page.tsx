export const dynamic = "force-dynamic";
export const revalidate = 0;

import { ReservationPageSettingsEditor } from "@/components/admin/website/reservation-page-settings";
import { fetchWebsiteContent } from "@/src/lib/website-public";

export default async function AdminReservationPageSettings() {
  const content = await fetchWebsiteContent();
  return <ReservationPageSettingsEditor initialSettings={content.settings} />;
}
