export const dynamic = "force-dynamic";
export const revalidate = 0;

import { SignatureDishesEditor } from "@/components/admin/website/signature-dishes-editor";
import { fetchWebsiteContent } from "@/src/lib/website-public";

export default async function AdminSignaturePage() {
  const content = await fetchWebsiteContent();
  return <SignatureDishesEditor content={content} />;
}
