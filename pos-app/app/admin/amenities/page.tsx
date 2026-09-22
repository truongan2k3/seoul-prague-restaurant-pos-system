export const dynamic = "force-dynamic";
export const revalidate = 0;

import { AmenitiesManager } from "@/components/admin/website/content-managers";
import { fetchWebsiteContent } from "@/src/lib/website-public";

export default async function AdminAmenitiesPage() {
  const content = await fetchWebsiteContent();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Amenities</h1>
        <p className="mt-2 text-sm text-gray-500">
          Manage amenity labels and icons. Toggle the Amenities section on the homepage from{" "}
          <a href="/admin/sections" className="text-[#8B6914] underline">
            Sections
          </a>
          .
        </p>
      </header>
      <AmenitiesManager initial={content.amenities} />
    </div>
  );
}
