import {
  DEFAULT_EUR_RATE,
  formatCzk,
  formatEurFromCzk,
} from "@/lib/currency";

export interface PriceDisplayOptions {
  enableRounding?: boolean;
  showEur?: boolean;
  eurRate?: number;
}

export function applyPriceRounding(amount: number, enabled = false): number {
  return enabled ? Math.round(amount) : amount;
}

export function formatPosPrice(amount: number, options: PriceDisplayOptions = {}): string {
  const rounded = applyPriceRounding(amount, options.enableRounding);
  const czk = formatCzk(rounded, options.enableRounding);
  if (options.showEur) {
    const rate = options.eurRate ?? DEFAULT_EUR_RATE;
    return `${czk} (~${formatEurFromCzk(rounded, rate)})`;
  }
  return czk;
}

export function priceDisplayOptionsFromSettings(settings: {
  enablePriceRounding: boolean;
  showEurCurrency: boolean;
  eurExchangeRate: number;
}): PriceDisplayOptions {
  return {
    enableRounding: settings.enablePriceRounding,
    showEur: settings.showEurCurrency,
    eurRate: settings.eurExchangeRate,
  };
}

/** Menu / cart lines — EUR optional separately from checkout totals. */
export function menuPriceDisplayOptionsFromSettings(settings: {
  enablePriceRounding: boolean;
  showEurCurrency: boolean;
  showEurOnMenu: boolean;
  eurExchangeRate: number;
}): PriceDisplayOptions {
  return {
    enableRounding: settings.enablePriceRounding,
    showEur: settings.showEurCurrency && settings.showEurOnMenu,
    eurRate: settings.eurExchangeRate,
  };
}
