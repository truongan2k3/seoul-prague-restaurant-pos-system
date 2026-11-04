import type { SaleRecord } from "@/lib/types";

/** Show the codes saved with the transaction, including historical codes. */
export function SaleDiscountCodeBadges({ sale }: { sale: SaleRecord }) {
  const codes = [...new Set([sale.referralCode, ...(sale.voucherCodes ?? [])]
    .map(code => code?.trim())
    .filter((code): code is string => Boolean(code)))];

  return codes.map(code => (
    <span
      key={code}
      className="inline-flex shrink-0 items-center whitespace-nowrap rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold leading-none text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
    >
      {code}
    </span>
  ));
}
