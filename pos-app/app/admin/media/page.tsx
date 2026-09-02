import { MediaManager } from "@/components/admin/website/media-manager";
import { fetchWebsiteContent } from "@/src/lib/website-public";

export default async function AdminMediaPage() {
  const content = await fetchWebsiteContent();
  return <MediaManager content={content} />;
}
