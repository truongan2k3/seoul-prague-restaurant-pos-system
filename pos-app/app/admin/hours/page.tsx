import { WebsiteHoursEditor } from "@/components/admin/website/settings-forms";
import { fetchWebsiteContent } from "@/src/lib/website-public";

export default async function AdminHoursPage() {
  const content = await fetchWebsiteContent();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Opening hours</h1>
      </header>
      <WebsiteHoursEditor initial={content.settings.openingHours} />
    </div>
  );
}
