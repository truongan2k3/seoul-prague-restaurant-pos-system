import { ClientDisplayView } from "@/components/client-display-view";
import { fetchWebsiteContent } from "@/src/lib/website-public";

export const revalidate = 120;

export default async function ClientDisplayPage() {
  const content = await fetchWebsiteContent();
  const logoUrl = content.media.logo?.fileUrl;
  const restaurantName = content.settings.restaurantName?.trim() || "SEOUL PRAGUE";

  return <ClientDisplayView logoUrl={logoUrl} restaurantName={restaurantName} />;
}
