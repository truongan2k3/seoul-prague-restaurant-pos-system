import { VideosManager } from "@/components/admin/website/content-managers";
import { fetchWebsiteContent } from "@/src/lib/website-public";

export default async function AdminVideosPage() {
  const content = await fetchWebsiteContent();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Videos & commercials</h1>
      </header>
      <VideosManager initial={content.videos} />
    </div>
  );
}
