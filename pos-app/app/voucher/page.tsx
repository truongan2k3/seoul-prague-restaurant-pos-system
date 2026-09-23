import { fetchWebsiteContent } from "@/src/lib/website-public";
import { VoucherPurchaseView } from "@/components/landing/voucher-purchase-view";

export const revalidate = 120;

export default async function VoucherPage() {
  const content = await fetchWebsiteContent();
  return <VoucherPurchaseView content={content} />;
}
