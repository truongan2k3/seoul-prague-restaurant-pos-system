import { WebsiteSettingsForm } from "@/components/admin/website/settings-forms";
import { fetchWebsiteContent } from "@/src/lib/website-public";

export default async function AdminSeoPage() {
  const content = await fetchWebsiteContent();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">SEO & sharing</h1>
      </header>
      <WebsiteSettingsForm
        title="Search & social metadata"
        initial={content.settings}
        fields={["seoTitle", "seoDescription", "seoOgImageUrl"]}
      />
    </div>
  );
}
