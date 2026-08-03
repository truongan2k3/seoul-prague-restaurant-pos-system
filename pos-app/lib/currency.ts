/** Display + receipt formatting — all POS amounts are stored in CZK. */

export const DEFAULT_EUR_RATE = 25;
export const DEFAULT_USD_RATE = 23;

/** Czech koruna display: `1 234,50 Kč` or `1 234 Kč` when rounded to integers. */
export function formatCzk(amount: number, roundToInteger = false): string {
  const value = roundToInteger ? Math.round(amount) : amount;
  if (roundToInteger) {
    const intPart = String(Math.round(value));
    const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return `${withSpaces} Kč`;
  }

  const fixed = value.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${withSpaces},${decPart} Kč`;
}

export function czkToEur(amountCzk: number, rate = DEFAULT_EUR_RATE): number {
  return amountCzk / rate;
}

export function czkToUsd(amountCzk: number, rate = DEFAULT_USD_RATE): number {
  return amountCzk / rate;
}

/** Receipt / secondary currency lines */
export function formatEurFromCzk(amountCzk: number, rate = DEFAULT_EUR_RATE): string {
  return `€${czkToEur(amountCzk, rate).toFixed(2)}`;
}

export function formatUsdFromCzk(amountCzk: number, rate = DEFAULT_USD_RATE): string {
  return `$${czkToUsd(amountCzk, rate).toFixed(2)}`;
}
