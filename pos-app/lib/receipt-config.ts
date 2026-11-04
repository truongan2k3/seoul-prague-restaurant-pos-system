import { DEFAULT_BUSINESS_NAME } from "@/lib/business-branding";

/** Default restaurant receipt header. */
export const RECEIPT_BUSINESS = {
  name: DEFAULT_BUSINESS_NAME,
  address: "Václavské nám. 819, 110 00 Praha",
  ico: "28765432",
  dic: "CZ28765432",
  tel: "+420 222 333 444",
  footer:
    "Děkujeme za Vaši návštěvu! Otevírací doba: Po-Ne 10:00-22:00",
} as const;

export const VAT_RATES = {
  A: 21,
  B: 12,
} as const;

export type TaxGroup = keyof typeof VAT_RATES;
