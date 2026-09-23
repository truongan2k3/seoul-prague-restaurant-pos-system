import { NextResponse } from "next/server";
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
      },
    },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
  );
}
