export const dynamic = "force-dynamic";
export const revalidate = 0;

import { WebsiteSectionBuilder } from "@/components/admin/website/section-builder";
import { fetchWebsiteContent } from "@/src/lib/website-public";

export default async function AdminSectionsPage() {
  const content = await fetchWebsiteContent();
  return <WebsiteSectionBuilder initial={content} />;
}
