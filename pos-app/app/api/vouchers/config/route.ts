import { NextResponse } from "next/server";
import { getResolvedVoucherDesign } from "@/lib/voucher";
import { fetchVoucherConfigServer } from "@/src/lib/voucher-server";

export async function GET() {
  const config = await fetchVoucherConfigServer();
  return NextResponse.json(
    {
      config: {
        enabled: config.enabled,
        denominationsCzk: config.denominationsCzk,
        bankName: config.bankName,
        accountHolder: config.accountHolder,
        accountNumber: config.accountNumber,
        iban: config.iban,
        bicSwift: config.bicSwift,
        bankPaymentNote: config.bankPaymentNote,
        processingMessage: config.processingMessage,
        validityDays: config.validityDays,
        design: getResolvedVoucherDesign(config),
      },
    },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
  );
}
