import { WebsiteVisualDesigner } from "@/components/admin/website/visual-designer";
import { fetchWebsiteContent } from "@/src/lib/website-public";

export default async function AdminDesignerPage() {
  const content = await fetchWebsiteContent();
  return <WebsiteVisualDesigner initial={content} />;
}
