import { GalleryManager } from "@/components/admin/website/content-managers";
import { fetchWebsiteContent } from "@/src/lib/website-public";

export default async function AdminGalleryPage() {
  const content = await fetchWebsiteContent();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Gallery</h1>
      </header>
      <GalleryManager initial={content.gallery} />
    </div>
  );
}
