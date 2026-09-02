import { WebsiteSettingsForm } from "@/components/admin/website/settings-forms";
import { fetchWebsiteContent } from "@/src/lib/website-public";

export default async function AdminRestaurantPage() {
  const content = await fetchWebsiteContent();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Restaurant information</h1>
      </header>
      <WebsiteSettingsForm
        title="General"
        initial={content.settings}
        fields={["restaurantName", "tagline", "description", "aboutStory", "phone", "email", "address", "googleMapsUrl"]}
      />
      <WebsiteSettingsForm
        title="Hero copy"
        initial={content.settings}
        fields={["heroHeadline", "heroTagline", "heroDescription"]}
      />
      <WebsiteSettingsForm
        title="Social links"
        initial={content.settings}
        fields={["instagramUrl", "facebookUrl", "tiktokUrl"]}
      />
    </div>
  );
}
