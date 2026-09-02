import { MenuManager } from "@/components/admin/website/content-managers";
import { fetchWebsiteContent } from "@/src/lib/website-public";

export default async function AdminMenuPage() {
  const content = await fetchWebsiteContent();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Menu</h1>
        <p className="mt-2 text-sm text-gray-500">Marketing menu for the landing page — separate from POS menu items.</p>
      </header>
      <MenuManager content={content} />
    </div>
  );
}
