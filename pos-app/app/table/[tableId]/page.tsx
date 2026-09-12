import type { Metadata } from "next";
import { TableGuestPageClient } from "@/components/table-guest-page-client";
import { fetchWebsiteContent } from "@/src/lib/website-public";

type Props = { params: Promise<{ tableId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tableId } = await params;
  const content = await fetchWebsiteContent();
  return {
    title: `Table · ${content.settings.restaurantName}`,
    description: `Guest page for table ${tableId}`,
    robots: { index: false, follow: false },
  };
}

export default async function TableGuestPage({ params }: Props) {
  const { tableId } = await params;
  const content = await fetchWebsiteContent();

  return (
    <TableGuestPageClient
      tableId={tableId}
      restaurantName={content.settings.restaurantName}
      logoUrl={content.media.logo?.fileUrl}
    />
  );
}
