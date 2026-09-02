import { AmenitiesManager } from "@/components/admin/website/content-managers";
import { fetchWebsiteContent } from "@/src/lib/website-public";

export default async function AdminAmenitiesPage() {
  const content = await fetchWebsiteContent();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Amenities</h1>
      </header>
      <AmenitiesManager initial={content.amenities} />
    </div>
  );
}
