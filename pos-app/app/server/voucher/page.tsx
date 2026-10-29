import { ToolsVoucherScannerView } from "@/components/tools-voucher-scanner-view";

export const metadata = { title: "Server — Voucher Scanner" };

export default function ServerVoucherPage() {
  return <ToolsVoucherScannerView returnTo="server" />;
}
